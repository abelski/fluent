# Tests for POST /api/admin/users/{user_id}/send-email — the superadmin ad-hoc
# email endpoint gaining a Premium-upsell footer (plan #18).
from unittest.mock import patch

from jose import jwt
from sqlmodel import Session, select

import email_service
from conftest import _test_engine
from models import User

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


SUPERADMIN_TOKEN = make_token("artyrbelski@gmail.com", name="Artur")


def _ensure_user(client, token):
    client.get("/api/me/quota", headers=auth(token))


def _get_user_id(client, email: str) -> str:
    users = client.get("/api/admin/users", headers=auth(SUPERADMIN_TOKEN)).json()
    return next(u["id"] for u in users if u["email"] == email)


def _set_email_consent(email: str, consent: bool) -> None:
    with Session(_test_engine) as s:
        u = s.exec(select(User).where(User.email == email)).first()
        assert u is not None
        u.email_consent = consent
        s.add(u)
        s.commit()


NON_PREMIUM_TOKEN = make_token("send_email_non_premium@example.com", name="Non Premium")
PREMIUM_TOKEN = make_token("send_email_premium@example.com", name="Premium User")
NO_CONSENT_TOKEN = make_token("send_email_no_consent@example.com", name="No Consent")


def test_send_email_to_non_premium_target_appends_upsell(client):
    _ensure_user(client, NON_PREMIUM_TOKEN)
    user_id = _get_user_id(client, "send_email_non_premium@example.com")

    with patch("email_service.send_email") as mock_send:
        r = client.post(
            f"/api/admin/users/{user_id}/send-email",
            json={"subject": "Hello", "body": "Hand-written message"},
            headers=auth(SUPERADMIN_TOKEN),
        )
    assert r.status_code == 200
    mock_send.assert_called_once()
    to, subject, body = mock_send.call_args[0]
    assert to == "send_email_non_premium@example.com"
    assert subject == "Hello"
    assert body.startswith("Hand-written message")
    assert body != "Hand-written message"
    assert "fluent.lt/pricing" in body


def test_send_email_to_premium_target_sent_unchanged(client):
    _ensure_user(client, PREMIUM_TOKEN)
    user_id = _get_user_id(client, "send_email_premium@example.com")

    r = client.patch(
        f"/api/admin/users/{user_id}/premium",
        json={"is_premium": True, "premium_until": None},
        headers=auth(SUPERADMIN_TOKEN),
    )
    assert r.status_code == 200

    with patch("email_service.send_email") as mock_send:
        r = client.post(
            f"/api/admin/users/{user_id}/send-email",
            json={"subject": "Hello", "body": "Hand-written message"},
            headers=auth(SUPERADMIN_TOKEN),
        )
    assert r.status_code == 200
    mock_send.assert_called_once()
    to, subject, body = mock_send.call_args[0]
    assert to == "send_email_premium@example.com"
    assert body == "Hand-written message"
    assert "fluent.lt/pricing" not in body


def test_send_email_still_403s_on_no_consent(client):
    _ensure_user(client, NO_CONSENT_TOKEN)
    user_id = _get_user_id(client, "send_email_no_consent@example.com")
    _set_email_consent("send_email_no_consent@example.com", False)

    with patch("email_service.send_email") as mock_send:
        r = client.post(
            f"/api/admin/users/{user_id}/send-email",
            json={"subject": "Hello", "body": "Should not be sent"},
            headers=auth(SUPERADMIN_TOKEN),
        )
    assert r.status_code == 403
    mock_send.assert_not_called()
