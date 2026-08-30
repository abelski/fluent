"""Stripe billing endpoints (#11).

Design rules that must not be relaxed:

* **The webhook is the only writer of entitlement.** The browser's return from Checkout
  (`/pricing/?checkout=success`) is attacker-controllable — anyone can type that URL — so it
  grants nothing. The success screen only polls `GET /api/me/quota` for state the webhook
  already wrote.

* **Handlers write `premium_until` as an absolute value, never `+= 1 month`.** Stripe retries
  and redelivers events; an incrementing handler double-extends on redelivery. Writing the
  subscription's own period end is idempotent by construction, which is why there is no
  processed-event table here and why overlapping handlers (`invoice.paid` and
  `customer.subscription.updated` both fire on a renewal) are harmless.

* **…but clamped with max().** The weekly leaderboard reward adds 7 days to `premium_until`
  (`scheduler.py`). A plain overwrite would silently delete a subscriber's reward days at their
  next renewal, so `_extend_premium` never moves the date backwards.

* **Cancellation revokes nothing.** `customer.subscription.deleted` clears the subscription id
  and marks the status but leaves `premium_until` alone: the user keeps the time they paid for,
  and `quota.is_premium_active()` lapses them on its own when that date passes. No expiry job.
"""

from __future__ import annotations

import asyncio
import logging
import os
from typing import Any, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlmodel import Session, select

import stripe_service
import telegram_service
from auth import require_user
from database import get_session
from models import User
from quota import is_premium_active

logger = logging.getLogger(__name__)

router = APIRouter()

# Events we act on. Anything else is acknowledged with 200 and ignored — returning a non-2xx
# for an unhandled type would make Stripe retry it forever.
HANDLED_EVENTS = {
    "checkout.session.completed",
    "invoice.paid",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_failed",
}


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


def _require_configured() -> None:
    if not stripe_service.is_configured():
        raise HTTPException(status_code=503, detail="Billing is not configured")


# ── Entitlement mutations (webhook-only) ─────────────────────────────────────

def _extend_premium(user: User, period_end_ts: Optional[int]) -> None:
    """Move premium_until forward to the subscription's paid-through date.

    Never moves it backwards — see the module docstring on leaderboard-gifted days.
    """
    if not period_end_ts:
        return
    new_end = stripe_service.to_naive_utc(period_end_ts)
    if user.premium_until is None or new_end > user.premium_until:
        user.premium_until = new_end


def _user_by_customer(customer_id: Optional[str], session: Session) -> Optional[User]:
    if not customer_id:
        return None
    return session.exec(select(User).where(User.stripe_customer_id == customer_id)).first()


def _obj(event: Any) -> Any:
    data = event.get("data") if isinstance(event, dict) else getattr(event, "data", None)
    if data is None:
        return {}
    return (data.get("object") if isinstance(data, dict) else getattr(data, "object", None)) or {}


def _customer_id(obj: Any) -> Optional[str]:
    cust = obj.get("customer") if isinstance(obj, dict) else getattr(obj, "customer", None)
    if not cust:
        return None
    return cust if isinstance(cust, str) else cust.get("id")


# ── Admin notifications (Telegram) ───────────────────────────────────────────

def _field(obj: Any, key: str) -> Any:
    """Read a field off a Stripe object that may be a dict or an attribute-style object."""
    return obj.get(key) if isinstance(obj, dict) else getattr(obj, key, None)


def _money(amount_cents: Any, currency: Any) -> str:
    """Format a Stripe minor-unit amount for a human. `0` is a valid amount — test for None.

    Never raises: this runs before the entitlement commit, so an unexpected payload shape must
    degrade the message, not 500 the webhook (which would leave premium ungranted).
    """
    if amount_cents is None or not currency:
        return "amount unknown"
    try:
        return f"{amount_cents / 100:.2f} {str(currency).upper()}"
    except (TypeError, ValueError):
        return "amount unknown"


# ── Routes ───────────────────────────────────────────────────────────────────

@router.get("/billing/config")
def billing_config():
    """Public. Lets the frontend fall back to the non-Stripe CTA when billing is unconfigured."""
    return {"enabled": stripe_service.is_configured()}


@router.post("/billing/checkout-session")
def create_checkout_session(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Start a subscription checkout. Returns a hosted Stripe URL for the browser to visit."""
    _require_configured()
    user = require_user(authorization, session)

    if is_premium_active(user):
        raise HTTPException(status_code=409, detail="Premium is already active")

    base = _frontend_url()
    try:
        url = stripe_service.create_checkout_session(
            user,
            session,
            success_url=f"{base}/pricing/?checkout=success",
            cancel_url=f"{base}/pricing/?checkout=cancelled",
        )
    except Exception as exc:
        logger.error("Stripe checkout creation failed for user %s: %s", user.id, type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not start checkout")
    return {"url": url}


@router.post("/billing/portal-session")
def create_portal_session(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Open the Stripe Customer Portal (cancel / update card / invoices)."""
    _require_configured()
    user = require_user(authorization, session)

    if not user.stripe_customer_id:
        raise HTTPException(status_code=400, detail="No billing account for this user")

    try:
        url = stripe_service.create_portal_session(
            user.stripe_customer_id, return_url=f"{_frontend_url()}/pricing/"
        )
    except Exception as exc:
        # The most likely cause is the Customer Portal never being activated in the Stripe
        # dashboard for this mode — there is no code-side workaround for that.
        logger.error("Stripe portal creation failed for user %s: %s", user.id, type(exc).__name__)
        raise HTTPException(status_code=502, detail="Could not open billing portal")
    return {"url": url}


@router.post("/billing/webhook")
async def stripe_webhook(
    request: Request,
    stripe_signature: Optional[str] = Header(None, alias="Stripe-Signature"),
    session: Session = Depends(get_session),
):
    """Stripe webhook receiver. Unauthenticated — trust comes from the signature alone."""
    # Must be the RAW body. Binding a Pydantic model here would re-serialise the JSON and the
    # signature would never match again.
    payload = await request.body()

    try:
        event = stripe_service.verify_event(payload, stripe_signature)
    except ValueError as exc:
        logger.warning("Rejected Stripe webhook: %s", exc)
        raise HTTPException(status_code=400, detail="Invalid signature")

    event_type = event.get("type") if isinstance(event, dict) else getattr(event, "type", None)
    if event_type not in HANDLED_EVENTS:
        logger.info("Stripe webhook: ignoring event type %s", event_type)
        return {"received": True, "handled": False}

    obj = _obj(event)
    user = _user_by_customer(_customer_id(obj), session)

    if user is None and event_type == "checkout.session.completed":
        # First-ever checkout: the customer id may not be linked to the user yet.
        ref = obj.get("client_reference_id") if isinstance(obj, dict) else getattr(obj, "client_reference_id", None)
        if ref:
            user = session.get(User, ref)
            if user and not user.stripe_customer_id:
                user.stripe_customer_id = _customer_id(obj)

    if user is None:
        # Nothing to do, but 200 so Stripe stops retrying (e.g. a customer created by hand in
        # the dashboard, or a deleted account).
        logger.warning("Stripe webhook %s: no matching user", event_type)
        return {"received": True, "handled": False}

    event_id = _field(event, "id")
    notify_text: Optional[str] = None

    if event_type == "checkout.session.completed":
        sub_id = obj.get("subscription") if isinstance(obj, dict) else getattr(obj, "subscription", None)
        if sub_id and not isinstance(sub_id, str):
            sub_id = sub_id.get("id")
        user.stripe_subscription_id = sub_id
        user.subscription_status = "active"
        user.is_premium = True
        if sub_id:
            try:
                sub = stripe_service.retrieve_subscription(sub_id)
                _extend_premium(user, stripe_service.subscription_period_end(sub))
            except Exception as exc:
                # customer.subscription.updated will carry the same period end moments later.
                logger.error("Could not retrieve subscription %s: %s", sub_id, type(exc).__name__)
        notify_text = (
            f"💳 New Premium subscriber\n{user.email}\n"
            f"{_money(_field(obj, 'amount_total'), _field(obj, 'currency'))} — Fluent Premium\n"
            f"Event: {event_id}"
        )

    elif event_type == "invoice.paid":
        sub_id = stripe_service.subscription_id_from_invoice(obj)
        if sub_id:
            user.stripe_subscription_id = sub_id
            try:
                sub = stripe_service.retrieve_subscription(sub_id)
                _extend_premium(user, stripe_service.subscription_period_end(sub))
                user.is_premium = True
                user.subscription_status = "active"
            except Exception as exc:
                logger.error("Could not retrieve subscription %s: %s", sub_id, type(exc).__name__)
        # Only a true renewal notifies. `subscription_create` is the first invoice of a new
        # subscription — the same payment checkout.session.completed already announced.
        if _field(obj, "billing_reason") == "subscription_cycle":
            notify_text = (
                f"🔄 Premium renewed\n{user.email}\n"
                f"{_money(_field(obj, 'amount_paid'), _field(obj, 'currency'))} — Fluent Premium\n"
                f"Event: {event_id}"
            )

    elif event_type == "customer.subscription.updated":
        # Deliberately silent (no notify_text): this overlaps invoice.paid on every renewal and
        # also fires on trial/plan/dunning changes where no payment happened.
        sub_id = obj.get("id") if isinstance(obj, dict) else getattr(obj, "id", None)
        status = obj.get("status") if isinstance(obj, dict) else getattr(obj, "status", None)
        user.stripe_subscription_id = sub_id
        if status in ("active", "trialing"):
            user.subscription_status = "active"
            user.is_premium = True
            _extend_premium(user, stripe_service.subscription_period_end(obj))
        elif status in ("past_due", "unpaid", "incomplete"):
            user.subscription_status = "past_due"
        elif status == "canceled":
            user.subscription_status = "canceled"

    elif event_type == "customer.subscription.deleted":
        # Deliberately leaves premium_until and is_premium alone: the user keeps the period
        # they already paid for, and is_premium_active() expires them when it elapses.
        user.subscription_status = "canceled"
        user.stripe_subscription_id = None
        notify_text = (
            f"🚫 Subscription canceled\n{user.email}\nFluent Premium\nEvent: {event_id}"
        )

    elif event_type == "invoice.payment_failed":
        # No entitlement change — Stripe's dunning retries, and premium lapses on its own if
        # the retries never succeed.
        user.subscription_status = "past_due"
        notify_text = (
            f"⚠️ Payment failed\n{user.email}\n"
            f"{_money(_field(obj, 'amount_due'), _field(obj, 'currency'))} — Fluent Premium\n"
            f"Event: {event_id}"
        )

    session.add(user)
    session.commit()

    # After the commit only, so a failed DB write can never produce a "success" ping — and at
    # most one message per delivery. Stripe redelivery can duplicate this ping; accepted, not
    # solved (same stance as the missing processed-event table).
    if notify_text:
        await asyncio.to_thread(telegram_service.send_telegram, notify_text)

    return {"received": True, "handled": True}
