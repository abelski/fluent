# Autotests for premium/basic quota and admin endpoints.
# Runs against a live local server on http://localhost:8000.

import pytest
import requests
from datetime import datetime, timezone, timedelta
from jose import jwt

BASE = "http://localhost:8000"
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

def test_quota_requires_auth():
    r = requests.get(f"{BASE}/api/me/quota")
    assert r.status_code == 401


def test_quota_returns_basic_defaults():
    token = make_token("quota_test_basic@example.com")
    r = requests.get(f"{BASE}/api/me/quota", headers=auth_headers(token))
    assert r.status_code == 200
    data = r.json()
    assert data["is_premium"] is False
    assert data["premium_active"] is False
    assert data["daily_limit"] == 10
    assert data["is_admin"] is False


# ── Daily limit enforcement ────────────────────────────────────────────────

def test_daily_limit_enforced():
    """A basic user should be blocked after 10 sessions on the same day."""
    email = "quota_limit_test@example.com"
    token = make_token(email)
    headers = auth_headers(token)

    # Get list ID to study
    lists = requests.get(f"{BASE}/api/lists").json()
    if not lists:
        pytest.skip("No word lists in DB")
    list_id = lists[0]["id"]

    # Reset: get current count
    quota = requests.get(f"{BASE}/api/me/quota", headers=headers).json()
    already_used = quota["sessions_today"]
    sessions_left = 10 - already_used

    # Use up remaining sessions
    for _ in range(sessions_left):
        r = requests.get(f"{BASE}/api/lists/{list_id}/study", headers=headers)
        assert r.status_code == 200

    # Next session should be blocked
    r = requests.get(f"{BASE}/api/lists/{list_id}/study", headers=headers)
    assert r.status_code == 429
    detail = r.json()["detail"]
    assert detail["code"] == "daily_limit_reached"
    assert detail["limit"] == 10


# ── Admin endpoints ────────────────────────────────────────────────────────

def test_admin_list_users_requires_admin():
    # First ensure user exists in DB (auto-created via quota endpoint)
    token = make_token("not_admin@example.com")
    requests.get(f"{BASE}/api/me/quota", headers=auth_headers(token))
    # Now call admin endpoint — should be 403 (user exists but not admin)
    r = requests.get(f"{BASE}/api/admin/users", headers=auth_headers(token))
    assert r.status_code == 403


def test_admin_list_users_as_admin():
    token = make_token("artyrbelski@gmail.com", name="Artur")
    r = requests.get(f"{BASE}/api/admin/users", headers=auth_headers(token))
    assert r.status_code == 200
    users = r.json()
    assert isinstance(users, list)
    assert len(users) > 0
    # Each row has required keys
    for u in users:
        assert "email" in u
        assert "sessions_today" in u
        assert "premium_active" in u


def test_admin_grant_and_revoke_premium():
    admin_token = make_token("artyrbelski@gmail.com", name="Artur")
    admin_headers = auth_headers(admin_token)

    # Get a non-admin user to modify
    users = requests.get(f"{BASE}/api/admin/users", headers=admin_headers).json()
    target = next((u for u in users if not u["is_admin"]), None)
    if not target:
        pytest.skip("No non-admin user in DB")

    user_id = target["id"]

    # Grant premium with expiry
    future = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%S")
    r = requests.patch(
        f"{BASE}/api/admin/users/{user_id}/premium",
        json={"is_premium": True, "premium_until": future},
        headers=admin_headers,
    )
    assert r.status_code == 200

    # Verify via user list
    users = requests.get(f"{BASE}/api/admin/users", headers=admin_headers).json()
    updated = next(u for u in users if u["id"] == user_id)
    assert updated["is_premium"] is True
    assert updated["premium_active"] is True

    # Revoke premium
    r = requests.patch(
        f"{BASE}/api/admin/users/{user_id}/premium",
        json={"is_premium": False, "premium_until": None},
        headers=admin_headers,
    )
    assert r.status_code == 200

    # Verify revoked
    users = requests.get(f"{BASE}/api/admin/users", headers=admin_headers).json()
    updated = next(u for u in users if u["id"] == user_id)
    assert updated["is_premium"] is False


def test_admin_rejects_past_expiry():
    admin_token = make_token("artyrbelski@gmail.com", name="Artur")
    admin_headers = auth_headers(admin_token)

    users = requests.get(f"{BASE}/api/admin/users", headers=admin_headers).json()
    target = next((u for u in users if not u["is_admin"]), None)
    if not target:
        pytest.skip("No non-admin user in DB")

    past = "2020-01-01T00:00:00"
    r = requests.patch(
        f"{BASE}/api/admin/users/{target['id']}/premium",
        json={"is_premium": True, "premium_until": past},
        headers=admin_headers,
    )
    assert r.status_code == 400


# ── Premium users skip daily limit ─────────────────────────────────────────

def test_premium_user_no_daily_limit():
    admin_token = make_token("artyrbelski@gmail.com", name="Artur")
    admin_headers = auth_headers(admin_token)

    # Create / find a test user to promote
    test_email = "quota_premium_test@example.com"
    test_token = make_token(test_email)

    # Ensure the user exists by calling quota (auto-creates on first _require_user call)
    requests.get(f"{BASE}/api/me/quota", headers=auth_headers(test_token))

    users = requests.get(f"{BASE}/api/admin/users", headers=admin_headers).json()
    target = next((u for u in users if u["email"] == test_email), None)
    if not target:
        pytest.skip("Test user not created")

    # Grant unlimited premium
    requests.patch(
        f"{BASE}/api/admin/users/{target['id']}/premium",
        json={"is_premium": True, "premium_until": None},
        headers=admin_headers,
    )

    # Verify quota shows premium
    quota = requests.get(f"{BASE}/api/me/quota", headers=auth_headers(test_token)).json()
    assert quota["premium_active"] is True
    assert quota["daily_limit"] is None

    # Study endpoint should not be blocked regardless of count
    lists = requests.get(f"{BASE}/api/lists").json()
    if lists:
        r = requests.get(f"{BASE}/api/lists/{lists[0]['id']}/study", headers=auth_headers(test_token))
        assert r.status_code == 200

    # Cleanup: revoke premium
    requests.patch(
        f"{BASE}/api/admin/users/{target['id']}/premium",
        json={"is_premium": False, "premium_until": None},
        headers=admin_headers,
    )
