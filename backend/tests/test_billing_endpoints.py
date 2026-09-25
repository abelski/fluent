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
from models import StripeLinkageAudit, User

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


def test_stripe_failure_logged_and_sent_to_telegram(client, configured, monkeypatch, caplog):
    """#180: the admin gets Stripe's own diagnosis, not just an exception class name."""
    import stripe
    import telegram_service

    _user_id(client, "stale@example.com")
    sent = []
    monkeypatch.setattr(telegram_service, "send_telegram", sent.append)

    def _missing(user, session, success_url, cancel_url):
        raise stripe.InvalidRequestError(
            "No such customer: 'cus_old'; a similar object exists in test mode",
            "customer", code="resource_missing", http_status=400,
        )

    monkeypatch.setattr(stripe_service, "create_checkout_session", _missing)
    r = client.post("/api/billing/checkout-session", headers=auth(make_token("stale@example.com")))
    assert r.status_code == 502
    assert len(sent) == 1
    for text in (sent[0], caplog.text):
        assert "resource_missing" in text and "param=customer" in text and "test mode" in text
    assert "stale@example.com" in sent[0]


def test_non_stripe_failure_reports_class_name_only(client, configured, monkeypatch):
    import telegram_service

    _user_id(client, "dsn@example.com")
    sent = []
    monkeypatch.setattr(telegram_service, "send_telegram", sent.append)

    def _boom(user, session, success_url, cancel_url):
        raise RuntimeError("postgresql://secret@host/db")

    monkeypatch.setattr(stripe_service, "create_checkout_session", _boom)
    client.post("/api/billing/checkout-session", headers=auth(make_token("dsn@example.com")))
    assert "RuntimeError" in sent[0] and "secret" not in sent[0]


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


def test_portal_failure_sent_to_telegram(client, configured, monkeypatch):
    import stripe
    import telegram_service

    uid = _user_id(client, "portalfail@example.com")
    with Session(database.engine) as s:
        u = s.get(User, uid)
        u.stripe_customer_id = "cus_gone"
        s.add(u)
        s.commit()
    sent = []
    monkeypatch.setattr(telegram_service, "send_telegram", sent.append)

    def _missing(customer_id, return_url):
        raise stripe.InvalidRequestError("No such customer: 'cus_gone'", "customer", code="resource_missing")

    monkeypatch.setattr(stripe_service, "create_portal_session", _missing)
    r = client.post("/api/billing/portal-session", headers=auth(make_token("portalfail@example.com")))
    assert r.status_code == 409  # missing customer → cleared + 409 (#180 step 5), still alerted
    assert "Stripe portal failed" in sent[0] and "cus_gone" in sent[0] and "resource_missing" in sent[0]


# ── /api/me/quota exposes the new fields (reused instead of a new endpoint) ───

def test_quota_exposes_subscription_fields(client):
    _user_id(client, "quotafields@example.com")
    body = client.get("/api/me/quota", headers=auth(make_token("quotafields@example.com"))).json()
    assert "subscription_status" in body and "has_billing_account" in body
    assert body["subscription_status"] is None and body["has_billing_account"] is False


# ── #180 self-heal, exercised through the real stripe SDK entry points ───────

def _set(uid: str, **fields) -> None:
    with Session(database.engine) as s:
        u = s.get(User, uid)
        for k, v in fields.items():
            setattr(u, k, v)
        s.add(u)
        s.commit()


def _missing_customer_error():
    import stripe
    return stripe.InvalidRequestError(
        "No such customer: 'cus_stale'; a similar object exists in test mode",
        "customer", code="resource_missing", http_status=400,
    )


def test_checkout_self_heals_missing_customer(client, configured, monkeypatch):
    import stripe
    import telegram_service

    monkeypatch.setattr(telegram_service, "send_telegram", lambda text: None)
    uid = _user_id(client, "heal@example.com")
    _set(uid, stripe_customer_id="cus_stale", stripe_subscription_id="sub_stale",
         subscription_status="canceled")

    customers_sent = []

    def _session_create(**kwargs):
        customers_sent.append(kwargs["customer"])
        if kwargs["customer"] == "cus_stale":
            raise _missing_customer_error()
        return {"url": "https://checkout.stripe.com/fresh"}

    monkeypatch.setattr(stripe.checkout.Session, "create", _session_create)
    monkeypatch.setattr(stripe.Customer, "create", lambda **kw: {"id": "cus_fresh"})

    r = client.post("/api/billing/checkout-session", headers=auth(make_token("heal@example.com")))
    assert r.status_code == 200 and r.json()["url"] == "https://checkout.stripe.com/fresh"
    assert customers_sent == ["cus_stale", "cus_fresh"]  # exactly one retry
    with Session(database.engine) as s:
        u = s.get(User, uid)
        assert u.stripe_customer_id == "cus_fresh"
        assert u.stripe_subscription_id is None and u.subscription_status is None
        audit = s.exec(select(StripeLinkageAudit).where(StripeLinkageAudit.user_id == uid)).one()
        assert audit.stripe_customer_id == "cus_stale" and audit.subscription_status == "canceled"


def test_checkout_other_stripe_error_is_502_and_logged_without_key(client, configured, monkeypatch, caplog):
    import stripe
    import telegram_service

    monkeypatch.setattr(telegram_service, "send_telegram", lambda text: None)
    uid = _user_id(client, "declined@example.com")
    _set(uid, stripe_customer_id="cus_ok")
    calls = []

    def _session_create(**kwargs):
        calls.append(kwargs)
        err = stripe.InvalidRequestError("No such price: 'price_dummy'", "line_items[0][price]",
                                         code="resource_missing", http_status=400)
        err.request_id = "req_abc123"
        raise err

    monkeypatch.setattr(stripe.checkout.Session, "create", _session_create)
    r = client.post("/api/billing/checkout-session", headers=auth(make_token("declined@example.com")))
    assert r.status_code == 502
    assert len(calls) == 1  # not a missing customer → no retry
    assert "code=resource_missing" in caplog.text and "req_abc123" in caplog.text
    assert "sk_" not in caplog.text
    with Session(database.engine) as s:
        assert s.get(User, uid).stripe_customer_id == "cus_ok"  # untouched


def test_portal_missing_customer_clears_linkage_and_409(client, configured, monkeypatch):
    import datetime
    import stripe
    import telegram_service

    sent = []
    monkeypatch.setattr(telegram_service, "send_telegram", sent.append)
    uid = _user_id(client, "portalheal@example.com")
    until = datetime.datetime(2099, 1, 1)
    _set(uid, stripe_customer_id="cus_stale", stripe_subscription_id="sub_stale",
         subscription_status="active", is_premium=True, premium_until=until)

    def _portal_create(**kwargs):
        raise _missing_customer_error()

    monkeypatch.setattr(stripe.billing_portal.Session, "create", _portal_create)
    r = client.post("/api/billing/portal-session", headers=auth(make_token("portalheal@example.com")))
    assert r.status_code == 409
    with Session(database.engine) as s:
        u = s.get(User, uid)
        assert u.stripe_customer_id is None
        assert u.stripe_subscription_id is None and u.subscription_status is None
        assert u.is_premium is True and u.premium_until == until
        # The clear is reversible: old ids are kept in the audit table and sent as restore SQL.
        audit = s.exec(select(StripeLinkageAudit).where(StripeLinkageAudit.user_id == uid)).one()
        assert (audit.stripe_customer_id, audit.stripe_subscription_id, audit.subscription_status) == (
            "cus_stale", "sub_stale", "active")
    restore = next(t for t in sent if "Restore" in t)
    assert "stripe_customer_id='cus_stale'" in restore and "stripe_subscription_id='sub_stale'" in restore
    assert f"WHERE id='{uid}'" in restore
