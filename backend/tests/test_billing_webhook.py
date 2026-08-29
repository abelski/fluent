# Autotests for the Stripe webhook handlers (#11).
#
# The webhook is the ONLY thing in the app that grants or changes Stripe-driven premium, so
# these tests pin the four properties the design depends on:
#
#   1. A bad signature mutates nothing (the endpoint is unauthenticated — the signature IS the auth).
#   2. Redelivery is idempotent: handlers write premium_until as an absolute value, never `+= 1 month`.
#   3. max() clamping never shortens premium bought or gifted elsewhere (weekly leaderboard reward).
#   4. Cancellation does not claw back the period already paid for.
#
# stripe_service.verify_event / retrieve_subscription are monkeypatched, so no network and no
# STRIPE_* env vars are needed. Uses TestClient + in-memory SQLite (backend/conftest.py).

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt
from sqlmodel import Session, select

import database
import stripe_service
from models import User
from quota import is_premium_active

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Billing User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _user_id(client, email: str) -> str:
    """Ensure the user row exists (auto-created on first authed call). Returns its id."""
    client.get("/api/me/quota", headers=auth(make_token(email)))
    with Session(database.engine) as s:
        return s.exec(select(User).where(User.email == email)).first().id


def _link_customer(user_id: str, customer_id: str) -> None:
    with Session(database.engine) as s:
        u = s.get(User, user_id)
        u.stripe_customer_id = customer_id
        s.add(u)
        s.commit()


def _get(user_id: str) -> User:
    with Session(database.engine) as s:
        return s.get(User, user_id)


def _ts(days: int) -> int:
    return int((datetime.now(timezone.utc) + timedelta(days=days)).timestamp())


def _naive(days: int) -> datetime:
    return (datetime.now(timezone.utc) + timedelta(days=days)).replace(tzinfo=None)


def _post(client, event: dict, monkeypatch, sub=None):
    """Deliver a webhook event with signature verification stubbed out."""
    monkeypatch.setattr(stripe_service, "verify_event", lambda payload, sig: event)
    if sub is not None:
        monkeypatch.setattr(stripe_service, "retrieve_subscription", lambda sub_id: sub)
    return client.post("/api/billing/webhook", content=b"{}", headers={"Stripe-Signature": "t=1,v1=x"})


# ── 1. Signature ─────────────────────────────────────────────────────────────

def test_bad_signature_is_rejected_and_mutates_nothing(client, monkeypatch):
    uid = _user_id(client, "sig@example.com")
    _link_customer(uid, "cus_sig")

    def _boom(payload, sig):
        raise ValueError("Invalid Stripe signature")

    monkeypatch.setattr(stripe_service, "verify_event", _boom)
    r = client.post("/api/billing/webhook", content=b"{}", headers={"Stripe-Signature": "bogus"})

    assert r.status_code == 400
    u = _get(uid)
    assert u.is_premium is False and u.premium_until is None and u.subscription_status is None


def test_missing_signature_header_is_rejected(client, monkeypatch):
    def _boom(payload, sig):
        raise ValueError("Missing Stripe-Signature header")

    monkeypatch.setattr(stripe_service, "verify_event", _boom)
    assert client.post("/api/billing/webhook", content=b"{}").status_code == 400


# ── 2. checkout.session.completed ────────────────────────────────────────────

def test_checkout_completed_grants_premium_and_links_ids(client, monkeypatch):
    uid = _user_id(client, "checkout@example.com")
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {"customer": "cus_new", "subscription": "sub_new", "client_reference_id": uid}},
    }
    r = _post(client, event, monkeypatch, sub={"id": "sub_new", "current_period_end": _ts(30)})

    assert r.status_code == 200 and r.json()["handled"] is True
    u = _get(uid)
    assert u.is_premium is True
    assert u.stripe_customer_id == "cus_new"
    assert u.stripe_subscription_id == "sub_new"
    assert u.subscription_status == "active"
    assert is_premium_active(u) is True


def test_redelivery_is_idempotent(client, monkeypatch):
    """The same event twice must not double-extend premium_until (decision: absolute writes)."""
    uid = _user_id(client, "redeliver@example.com")
    period_end = _ts(30)
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {"customer": "cus_redeliver", "subscription": "sub_r", "client_reference_id": uid}},
    }
    sub = {"id": "sub_r", "current_period_end": period_end}

    _post(client, event, monkeypatch, sub=sub)
    first = _get(uid).premium_until
    _post(client, event, monkeypatch, sub=sub)
    second = _get(uid).premium_until

    assert first == second == stripe_service.to_naive_utc(period_end)


def test_period_end_read_from_subscription_items_shape(client, monkeypatch):
    """Stripe moved current_period_end onto items in 2025-03-31.basil — both shapes must work."""
    uid = _user_id(client, "basil@example.com")
    period_end = _ts(30)
    event = {
        "type": "checkout.session.completed",
        "data": {"object": {"customer": "cus_basil", "subscription": "sub_b", "client_reference_id": uid}},
    }
    _post(client, event, monkeypatch, sub={"id": "sub_b", "items": {"data": [{"current_period_end": period_end}]}})

    assert _get(uid).premium_until == stripe_service.to_naive_utc(period_end)


# ── 3. Renewal + the leaderboard-gift clamp ──────────────────────────────────

def test_invoice_paid_extends_premium(client, monkeypatch):
    uid = _user_id(client, "renew@example.com")
    _link_customer(uid, "cus_renew")
    period_end = _ts(60)
    event = {"type": "invoice.paid", "data": {"object": {"customer": "cus_renew", "subscription": "sub_renew"}}}

    _post(client, event, monkeypatch, sub={"id": "sub_renew", "current_period_end": period_end})

    u = _get(uid)
    assert u.premium_until == stripe_service.to_naive_utc(period_end)
    assert u.subscription_status == "active" and u.is_premium is True


def test_renewal_never_shortens_gifted_premium(client, monkeypatch):
    """A leaderboard reward can push premium_until past the Stripe period end — keep the later one."""
    uid = _user_id(client, "gifted@example.com")
    _link_customer(uid, "cus_gift")
    gifted = _naive(30)
    with Session(database.engine) as s:
        u = s.get(User, uid)
        u.is_premium = True
        u.premium_until = gifted
        s.add(u)
        s.commit()

    event = {"type": "invoice.paid", "data": {"object": {"customer": "cus_gift", "subscription": "sub_gift"}}}
    _post(client, event, monkeypatch, sub={"id": "sub_gift", "current_period_end": _ts(7)})

    assert _get(uid).premium_until == gifted


# ── 4. Lifecycle: cancellation and failed payment ────────────────────────────

def test_subscription_deleted_keeps_paid_for_time(client, monkeypatch):
    uid = _user_id(client, "cancel@example.com")
    _link_customer(uid, "cus_cancel")
    paid_through = _naive(20)
    with Session(database.engine) as s:
        u = s.get(User, uid)
        u.is_premium = True
        u.premium_until = paid_through
        u.stripe_subscription_id = "sub_cancel"
        u.subscription_status = "active"
        s.add(u)
        s.commit()

    event = {"type": "customer.subscription.deleted", "data": {"object": {"id": "sub_cancel", "customer": "cus_cancel"}}}
    _post(client, event, monkeypatch)

    u = _get(uid)
    assert u.subscription_status == "canceled"
    assert u.stripe_subscription_id is None
    assert u.premium_until == paid_through          # not clawed back
    assert is_premium_active(u) is True             # still premium until it elapses


def test_expired_after_cancellation_lapses_on_its_own(client, monkeypatch):
    """No expiry job exists — is_premium_active() is what ends it."""
    uid = _user_id(client, "lapsed@example.com")
    _link_customer(uid, "cus_lapsed")
    with Session(database.engine) as s:
        u = s.get(User, uid)
        u.is_premium = True
        u.premium_until = _naive(-1)
        s.add(u)
        s.commit()

    event = {"type": "customer.subscription.deleted", "data": {"object": {"id": "s", "customer": "cus_lapsed"}}}
    _post(client, event, monkeypatch)

    assert is_premium_active(_get(uid)) is False


def test_payment_failed_marks_past_due_without_revoking(client, monkeypatch):
    uid = _user_id(client, "pastdue@example.com")
    _link_customer(uid, "cus_pastdue")
    paid_through = _naive(5)
    with Session(database.engine) as s:
        u = s.get(User, uid)
        u.is_premium = True
        u.premium_until = paid_through
        s.add(u)
        s.commit()

    event = {"type": "invoice.payment_failed", "data": {"object": {"customer": "cus_pastdue"}}}
    _post(client, event, monkeypatch)

    u = _get(uid)
    assert u.subscription_status == "past_due"
    assert u.premium_until == paid_through and is_premium_active(u) is True


def test_subscription_updated_syncs_status_and_period(client, monkeypatch):
    uid = _user_id(client, "updated@example.com")
    _link_customer(uid, "cus_updated")
    period_end = _ts(45)
    event = {
        "type": "customer.subscription.updated",
        "data": {"object": {"id": "sub_upd", "customer": "cus_updated", "status": "active",
                            "current_period_end": period_end}},
    }
    _post(client, event, monkeypatch)

    u = _get(uid)
    assert u.subscription_status == "active"
    assert u.premium_until == stripe_service.to_naive_utc(period_end)


# ── 5. Events and customers we don't act on ──────────────────────────────────

def test_unhandled_event_type_is_acknowledged_without_mutation(client, monkeypatch):
    uid = _user_id(client, "unhandled@example.com")
    _link_customer(uid, "cus_unhandled")

    event = {"type": "customer.updated", "data": {"object": {"customer": "cus_unhandled"}}}
    r = _post(client, event, monkeypatch)

    assert r.status_code == 200 and r.json()["handled"] is False
    assert _get(uid).is_premium is False


def test_unknown_customer_is_acknowledged_not_retried(client, monkeypatch):
    """200 so Stripe stops retrying — e.g. a customer created by hand in the dashboard."""
    event = {"type": "invoice.paid", "data": {"object": {"customer": "cus_does_not_exist"}}}
    r = _post(client, event, monkeypatch)
    assert r.status_code == 200 and r.json()["handled"] is False
