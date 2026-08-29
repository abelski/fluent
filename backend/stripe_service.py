"""Stripe integration (#11) — every direct `stripe.*` call in the app lives in this module.

Two things here are deliberate and easy to get wrong if changed:

1. **Config is read at call time, never at import time.** The test suite and a fresh local
   checkout have no STRIPE_* variables set, and importing this module must not fail there.
   `is_configured()` is the single gate used by both the router and `GET /billing/config`.

2. **Which Stripe mode we talk to is decided purely by which secret key is in the environment**
   (`sk_test_…` locally, `sk_live_…` on Render). There is no separate mode flag. Note that
   `STRIPE_PRICE_ID` has to be swapped together with the key — price ids do not exist across
   modes, so a live key plus a test price id fails at checkout creation.

`is_configured()` requires the webhook secret too, not just the key and price. Checkout without a
verifiable webhook would take the user's money and never grant them premium, which is strictly
worse than showing no checkout button at all.
"""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any, Optional

import stripe
from sqlmodel import Session

from models import User

logger = logging.getLogger(__name__)


# ── Config ───────────────────────────────────────────────────────────────────

def _secret_key() -> str:
    return os.getenv("STRIPE_SECRET_KEY", "").strip()


def price_id() -> str:
    return os.getenv("STRIPE_PRICE_ID", "").strip()


def webhook_secret() -> str:
    return os.getenv("STRIPE_WEBHOOK_SECRET", "").strip()


def is_configured() -> bool:
    """True only when checkout AND webhook verification can both work."""
    return bool(_secret_key() and price_id() and webhook_secret())


def _configure() -> None:
    stripe.api_key = _secret_key()


# ── Time helpers ─────────────────────────────────────────────────────────────

def to_naive_utc(unix_ts: int) -> datetime:
    """Stripe sends unix timestamps; User.premium_until is a naive-UTC column."""
    return datetime.fromtimestamp(unix_ts, tz=timezone.utc).replace(tzinfo=None)


# ── Shape helpers ────────────────────────────────────────────────────────────
#
# Stripe moved two fields between API versions, and the SDK pins whatever version it
# ships with. Rather than pinning an API version we read both shapes, so upgrading the
# `stripe` package can't silently break entitlement:
#
#   * `current_period_end` left the Subscription object in 2025-03-31.basil and now lives
#     on each subscription *item*.
#   * `invoice.subscription` became `invoice.parent.subscription_details.subscription`.

def subscription_period_end(sub: Any) -> Optional[int]:
    """Unix ts for the end of the period this subscription is currently paid through."""
    end = _get(sub, "current_period_end")
    if end:
        return int(end)
    items = _get(sub, "items") or {}
    data = _get(items, "data") or []
    ends = [int(_get(i, "current_period_end")) for i in data if _get(i, "current_period_end")]
    return max(ends) if ends else None


def subscription_id_from_invoice(invoice: Any) -> Optional[str]:
    sub = _get(invoice, "subscription")
    if sub:
        return sub if isinstance(sub, str) else _get(sub, "id")
    parent = _get(invoice, "parent") or {}
    details = _get(parent, "subscription_details") or {}
    sub = _get(details, "subscription")
    if sub:
        return sub if isinstance(sub, str) else _get(sub, "id")
    lines = _get(invoice, "lines") or {}
    for line in (_get(lines, "data") or []):
        sub = _get(line, "subscription")
        if sub:
            return sub if isinstance(sub, str) else _get(sub, "id")
    return None


def _get(obj: Any, key: str) -> Any:
    """Read a key from either a dict fixture or a StripeObject."""
    if obj is None:
        return None
    if isinstance(obj, dict):
        return obj.get(key)
    return getattr(obj, key, None)


# ── API calls ────────────────────────────────────────────────────────────────

def get_or_create_customer(user: User, session: Session) -> str:
    """Return the user's Stripe customer id, creating and persisting one on first use."""
    if user.stripe_customer_id:
        return user.stripe_customer_id
    _configure()
    customer = stripe.Customer.create(
        email=user.email,
        name=user.name or None,
        metadata={"user_id": user.id},
    )
    user.stripe_customer_id = customer["id"]
    session.add(user)
    session.commit()
    session.refresh(user)
    return user.stripe_customer_id


def create_checkout_session(user: User, session: Session, success_url: str, cancel_url: str) -> str:
    """Create a subscription Checkout Session and return its hosted URL."""
    customer_id = get_or_create_customer(user, session)
    _configure()
    checkout = stripe.checkout.Session.create(
        mode="subscription",
        customer=customer_id,
        client_reference_id=user.id,
        line_items=[{"price": price_id(), "quantity": 1}],
        success_url=success_url,
        cancel_url=cancel_url,
        allow_promotion_codes=False,
        subscription_data={"metadata": {"user_id": user.id}},
    )
    return checkout["url"]


def create_portal_session(customer_id: str, return_url: str) -> str:
    """Create a Customer Portal session (cancel / update card / invoices) and return its URL."""
    _configure()
    portal = stripe.billing_portal.Session.create(customer=customer_id, return_url=return_url)
    return portal["url"]


def retrieve_subscription(subscription_id: str) -> Any:
    _configure()
    return stripe.Subscription.retrieve(subscription_id)


def verify_event(payload: bytes, signature: Optional[str]) -> Any:
    """Verify a webhook payload against the signing secret.

    `payload` MUST be the raw request body. Parsing the JSON first and re-serialising it
    changes the bytes and the signature will never match.

    Raises ValueError on a bad or missing signature.
    """
    secret = webhook_secret()
    if not secret:
        raise ValueError("Stripe webhook secret is not configured")
    if not signature:
        raise ValueError("Missing Stripe-Signature header")
    try:
        return stripe.Webhook.construct_event(payload, signature, secret)
    except stripe.SignatureVerificationError as exc:
        # Top-level, not stripe.error.* — the `stripe.error` submodule stopped being importable
        # in stripe-python v12+. This spelling works on both v11 and v15.
        raise ValueError("Invalid Stripe signature") from exc
