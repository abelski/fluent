# Tests for superadmin role: only superadmin can grant/revoke admin to other users.
from jose import jwt

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


SUPERADMIN_TOKEN = make_token("artyrbelski@gmail.com", name="Artur")
ADMIN_TOKEN = make_token("plain_admin@example.com", name="Plain Admin")
USER_TOKEN = make_token("regular@example.com", name="Regular")


def _ensure_user(client, token):
    """Trigger auto-creation of a user by hitting quota endpoint."""
    client.get("/api/me/quota", headers=auth(token))


def _get_user_id(client, email: str) -> str:
    users = client.get("/api/admin/users", headers=auth(SUPERADMIN_TOKEN)).json()
    return next(u["id"] for u in users if u["email"] == email)


# ── quota exposes is_superadmin ───────────────────────────────────────────────

def test_quota_exposes_is_superadmin(client):
    r = client.get("/api/me/quota", headers=auth(SUPERADMIN_TOKEN))
    assert r.status_code == 200
    assert r.json()["is_superadmin"] is True


def test_quota_is_superadmin_false_for_regular(client):
    r = client.get("/api/me/quota", headers=auth(make_token("random@example.com")))
    assert r.status_code == 200
    assert r.json()["is_superadmin"] is False


# ── set-admin endpoint ────────────────────────────────────────────────────────

def test_superadmin_can_grant_admin(client):
    _ensure_user(client, USER_TOKEN)
    user_id = _get_user_id(client, "regular@example.com")

    r = client.patch(f"/api/admin/users/{user_id}/set-admin", json={"is_admin": True}, headers=auth(SUPERADMIN_TOKEN))
    assert r.status_code == 200

    users = client.get("/api/admin/users", headers=auth(SUPERADMIN_TOKEN)).json()
    updated = next(u for u in users if u["id"] == user_id)
    assert updated["is_admin"] is True

    # Cleanup
    client.patch(f"/api/admin/users/{user_id}/set-admin", json={"is_admin": False}, headers=auth(SUPERADMIN_TOKEN))


def test_superadmin_can_revoke_admin(client):
    # Seed a plain admin
    _ensure_user(client, ADMIN_TOKEN)
    # First grant admin
    user_id = _get_user_id(client, "plain_admin@example.com")
    client.patch(f"/api/admin/users/{user_id}/set-admin", json={"is_admin": True}, headers=auth(SUPERADMIN_TOKEN))

    # Then revoke
    r = client.patch(f"/api/admin/users/{user_id}/set-admin", json={"is_admin": False}, headers=auth(SUPERADMIN_TOKEN))
    assert r.status_code == 200

    users = client.get("/api/admin/users", headers=auth(SUPERADMIN_TOKEN)).json()
    updated = next(u for u in users if u["id"] == user_id)
    assert updated["is_admin"] is False


def test_regular_admin_cannot_grant_admin(client):
    """A user with is_admin=True but is_superadmin=False cannot use set-admin."""
    _ensure_user(client, ADMIN_TOKEN)
    admin_id = _get_user_id(client, "plain_admin@example.com")
    # Grant admin first
    client.patch(f"/api/admin/users/{admin_id}/set-admin", json={"is_admin": True}, headers=auth(SUPERADMIN_TOKEN))

    _ensure_user(client, USER_TOKEN)
    user_id = _get_user_id(client, "regular@example.com")

    r = client.patch(f"/api/admin/users/{user_id}/set-admin", json={"is_admin": True}, headers=auth(ADMIN_TOKEN))
    assert r.status_code == 403

    # Cleanup
    client.patch(f"/api/admin/users/{admin_id}/set-admin", json={"is_admin": False}, headers=auth(SUPERADMIN_TOKEN))


def test_unauthenticated_cannot_grant_admin(client):
    _ensure_user(client, USER_TOKEN)
    user_id = _get_user_id(client, "regular@example.com")
    r = client.patch(f"/api/admin/users/{user_id}/set-admin", json={"is_admin": True})
    assert r.status_code == 401


def test_cannot_change_superadmin_role(client):
    """Superadmin cannot demote themselves or another superadmin via set-admin."""
    superadmin_id = _get_user_id(client, "artyrbelski@gmail.com")
    r = client.patch(f"/api/admin/users/{superadmin_id}/set-admin", json={"is_admin": False}, headers=auth(SUPERADMIN_TOKEN))
    assert r.status_code == 400


def test_users_list_exposes_is_superadmin(client):
    users = client.get("/api/admin/users", headers=auth(SUPERADMIN_TOKEN)).json()
    superadmin = next(u for u in users if u["email"] == "artyrbelski@gmail.com")
    assert superadmin["is_superadmin"] is True
    # Regular users have is_superadmin = False
    _ensure_user(client, USER_TOKEN)
    users = client.get("/api/admin/users", headers=auth(SUPERADMIN_TOKEN)).json()
    regular = next((u for u in users if u["email"] == "regular@example.com"), None)
    if regular:
        assert regular["is_superadmin"] is False
