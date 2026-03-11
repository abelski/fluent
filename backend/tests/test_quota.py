# Autotests for premium/basic quota and admin endpoints.
# Uses TestClient + in-memory SQLite (configured in backend/conftest.py).
# No requests to localhost — zero production DB contact.

from datetime import datetime, timezone, timedelta
from jose import jwt

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode(
        {"email": email, "name": name, "picture": None},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ── Quota endpoint ──────────────────────────────────────────────────────────

def test_quota_requires_auth(client):
    r = client.get("/api/me/quota")
    assert r.status_code == 401


def test_quota_returns_basic_defaults(client):
    token = make_token("quota_test_basic@example.com")
    r = client.get("/api/me/quota", headers=auth_headers(token))
    assert r.status_code == 200
    data = r.json()
    assert data["is_premium"] is False
    assert data["premium_active"] is False
    assert data["daily_limit"] == 10
    assert data["is_admin"] is False


# ── Daily limit enforcement ────────────────────────────────────────────────

def test_daily_limit_enforced(client):
    """A basic user should be blocked after 10 sessions on the same day."""
    token = make_token("quota_limit_test@example.com")
    headers = auth_headers(token)

    quota = client.get("/api/me/quota", headers=headers).json()
    already_used = quota["sessions_today"]
    sessions_left = 10 - already_used

    for _ in range(sessions_left):
        r = client.get("/api/lists/1/study", headers=headers)
        assert r.status_code == 200

    r = client.get("/api/lists/1/study", headers=headers)
    assert r.status_code == 429
    detail = r.json()["detail"]
    assert detail["code"] == "daily_limit_reached"
    assert detail["limit"] == 10


# ── Admin endpoints ────────────────────────────────────────────────────────

def test_admin_list_users_requires_admin(client):
    token = make_token("not_admin@example.com")
    # Ensure user exists (auto-created via quota endpoint)
    client.get("/api/me/quota", headers=auth_headers(token))
    r = client.get("/api/admin/users", headers=auth_headers(token))
    assert r.status_code == 403


def test_admin_list_users_as_admin(client):
    token = make_token("artyrbelski@gmail.com", name="Artur")
    r = client.get("/api/admin/users", headers=auth_headers(token))
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list)
    assert len(users) > 0
    for u in users:
        assert "email" in u
        assert "sessions_today" in u
        assert "premium_active" in u


def test_admin_grant_and_revoke_premium(client):
    admin_token = make_token("artyrbelski@gmail.com", name="Artur")
    admin_hdrs = auth_headers(admin_token)

    users = client.get("/api/admin/users", headers=admin_hdrs).json()
    target = next((u for u in users if not u["is_admin"]), None)
    assert target is not None, "Need at least one non-admin user (seeded as test_user@example.com)"
    user_id = target["id"]

    future = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")
    r = client.patch(
        f"/api/admin/users/{user_id}/premium",
        json={"is_premium": True, "premium_until": future},
        headers=admin_hdrs,
    )
    assert r.status_code == 200

    users = client.get("/api/admin/users", headers=admin_hdrs).json()
    updated = next(u for u in users if u["id"] == user_id)
    assert updated["is_premium"] is True
    assert updated["premium_active"] is True

    r = client.patch(
        f"/api/admin/users/{user_id}/premium",
        json={"is_premium": False, "premium_until": None},
        headers=admin_hdrs,
    )
    assert r.status_code == 200

    users = client.get("/api/admin/users", headers=admin_hdrs).json()
    updated = next(u for u in users if u["id"] == user_id)
    assert updated["is_premium"] is False


def test_admin_rejects_past_expiry(client):
    admin_token = make_token("artyrbelski@gmail.com", name="Artur")
    admin_hdrs = auth_headers(admin_token)

    users = client.get("/api/admin/users", headers=admin_hdrs).json()
    target = next((u for u in users if not u["is_admin"]), None)
    assert target is not None

    r = client.patch(
        f"/api/admin/users/{target['id']}/premium",
        json={"is_premium": True, "premium_until": "2020-01-01T00:00:00"},
        headers=admin_hdrs,
    )
    assert r.status_code == 400


# ── Premium users skip daily limit ─────────────────────────────────────────

def test_premium_user_no_daily_limit(client):
    admin_token = make_token("artyrbelski@gmail.com", name="Artur")
    admin_hdrs = auth_headers(admin_token)

    test_email = "quota_premium_test@example.com"
    test_token = make_token(test_email)

    # Auto-create user
    client.get("/api/me/quota", headers=auth_headers(test_token))

    users = client.get("/api/admin/users", headers=admin_hdrs).json()
    target = next((u for u in users if u["email"] == test_email), None)
    assert target is not None

    # Grant unlimited premium
    client.patch(
        f"/api/admin/users/{target['id']}/premium",
        json={"is_premium": True, "premium_until": None},
        headers=admin_hdrs,
    )

    quota = client.get("/api/me/quota", headers=auth_headers(test_token)).json()
    assert quota["premium_active"] is True
    assert quota["daily_limit"] is None

    r = client.get("/api/lists/1/study", headers=auth_headers(test_token))
    assert r.status_code == 200

    # Cleanup
    client.patch(
        f"/api/admin/users/{target['id']}/premium",
        json={"is_premium": False, "premium_until": None},
        headers=admin_hdrs,
    )
