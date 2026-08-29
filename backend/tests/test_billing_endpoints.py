# Autotests for the Stripe checkout/portal/config endpoints (#11).
#
# No network: stripe_service's API-calling functions are monkeypatched. STRIPE_* env vars are
# set per-test via monkeypatch, because stripe_service reads config at CALL time (deliberately —
# importing it must not fail on a checkout with no Stripe set up).

import pytest
from jose import jwt
from sqlmodel import Session, select

import database
import stripe_service
from models import User

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Billing User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _user_id(client, email: str) -> str:
    client.get("/api/me/quota", headers=auth(make_token(email)))
    with Session(database.engine) as s:
        return s.exec(select(User).where(User.email == email)).first().id


@pytest.fixture
def configured(monkeypatch):
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy")
    monkeypatch.setenv("STRIPE_PRICE_ID", "price_dummy")
    monkeypatch.setenv("STRIPE_WEBHOOK_SECRET", "whsec_dummy")


# ── /billing/config ──────────────────────────────────────────────────────────

def test_config_reports_disabled_without_env(client, monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("STRIPE_PRICE_ID", raising=False)
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    assert client.get("/api/billing/config").json() == {"enabled": False}


def test_config_reports_enabled_when_configured(client, configured):
    assert client.get("/api/billing/config").json() == {"enabled": True}


def test_config_requires_webhook_secret_too(client, monkeypatch):
    """Checkout without a verifiable webhook would take money and never grant premium."""
    monkeypatch.setenv("STRIPE_SECRET_KEY", "sk_test_dummy")
    monkeypatch.setenv("STRIPE_PRICE_ID", "price_dummy")
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    assert client.get("/api/billing/config").json() == {"enabled": False}


# ── /billing/checkout-session ────────────────────────────────────────────────

def test_checkout_requires_auth(client, configured):
    assert client.post("/api/billing/checkout-session").status_code == 401


def test_checkout_returns_503_when_unconfigured(client, monkeypatch):
    monkeypatch.delenv("STRIPE_SECRET_KEY", raising=False)
    monkeypatch.delenv("STRIPE_PRICE_ID", raising=False)
    monkeypatch.delenv("STRIPE_WEBHOOK_SECRET", raising=False)
    r = client.post("/api/billing/checkout-session", headers=auth(make_token("nocfg@example.com")))
    assert r.status_code == 503


def test_checkout_returns_hosted_url(client, configured, monkeypatch):
    _user_id(client, "buyer@example.com")
    monkeypatch.setattr(
        stripe_service, "create_checkout_session",
        lambda user, session, success_url, cancel_url: f"https://checkout.stripe.com/x?s={success_url}",
    )
    r = client.post("/api/billing/checkout-session", headers=auth(make_token("buyer@example.com")))
    assert r.status_code == 200
    assert r.json()["url"].startswith("https://checkout.stripe.com/")
    # success_url must point at an actually-exported static route (trailingSlash: true)
    assert "/pricing/?checkout=success" in r.json()["url"]


def test_checkout_409_when_already_premium(client, configured):
    uid = _user_id(client, "already@example.com")
    with Session(database.engine) as s:
        u = s.get(User, uid)
        u.is_premium = True
        u.premium_until = None
        s.add(u)
        s.commit()
    r = client.post("/api/billing/checkout-session", headers=auth(make_token("already@example.com")))
    assert r.status_code == 409


def test_checkout_502_when_stripe_errors(client, configured, monkeypatch):
    _user_id(client, "flaky@example.com")

    def _boom(user, session, success_url, cancel_url):
        raise RuntimeError("stripe down")

    monkeypatch.setattr(stripe_service, "create_checkout_session", _boom)
    r = client.post("/api/billing/checkout-session", headers=auth(make_token("flaky@example.com")))
    assert r.status_code == 502


# ── /billing/portal-session ──────────────────────────────────────────────────

def test_portal_requires_auth(client, configured):
    assert client.post("/api/billing/portal-session").status_code == 401


def test_portal_400_without_billing_account(client, configured):
    _user_id(client, "noaccount@example.com")
    r = client.post("/api/billing/portal-session", headers=auth(make_token("noaccount@example.com")))
    assert r.status_code == 400


def test_portal_returns_url(client, configured, monkeypatch):
    uid = _user_id(client, "portal@example.com")
    with Session(database.engine) as s:
        u = s.get(User, uid)
        u.stripe_customer_id = "cus_portal"
        s.add(u)
        s.commit()
    monkeypatch.setattr(
        stripe_service, "create_portal_session",
        lambda customer_id, return_url: f"https://billing.stripe.com/p/{customer_id}",
    )
    r = client.post("/api/billing/portal-session", headers=auth(make_token("portal@example.com")))
    assert r.status_code == 200 and r.json()["url"] == "https://billing.stripe.com/p/cus_portal"


# ── /api/me/quota exposes the new fields (reused instead of a new endpoint) ───

def test_quota_exposes_subscription_fields(client):
    _user_id(client, "quotafields@example.com")
    body = client.get("/api/me/quota", headers=auth(make_token("quotafields@example.com"))).json()
    assert "subscription_status" in body and "has_billing_account" in body
    assert body["subscription_status"] is None and body["has_billing_account"] is False
