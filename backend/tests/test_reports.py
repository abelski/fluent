# Tests for mistake-report endpoints.
from jose import jwt

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


ADMIN_TOKEN = make_token("artyrbelski@gmail.com", name="Artur")
USER_TOKEN = make_token("report_user@example.com", name="Reporter")


def _ensure_user(client, token):
    client.get("/api/me/quota", headers=auth(token))


def test_authenticated_user_can_submit_report(client):
    _ensure_user(client, USER_TOKEN)
    r = client.post("/api/reports", json={"description": "Wrong translation", "context": "word:1"}, headers=auth(USER_TOKEN))
    assert r.status_code == 200
    assert r.json()["ok"] is True


def test_unauthenticated_cannot_submit_report(client):
    r = client.post("/api/reports", json={"description": "No token"})
    assert r.status_code == 401


def test_empty_description_rejected(client):
    _ensure_user(client, USER_TOKEN)
    r = client.post("/api/reports", json={"description": "   "}, headers=auth(USER_TOKEN))
    assert r.status_code == 400


def test_admin_can_list_reports(client):
    _ensure_user(client, USER_TOKEN)
    client.post("/api/reports", json={"description": "Bad word"}, headers=auth(USER_TOKEN))
    r = client.get("/api/admin/reports", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert any(rep["description"] == "Bad word" for rep in data)


def test_non_admin_cannot_list_reports(client):
    _ensure_user(client, USER_TOKEN)
    r = client.get("/api/admin/reports", headers=auth(USER_TOKEN))
    assert r.status_code == 403


def test_admin_can_resolve_report(client):
    _ensure_user(client, USER_TOKEN)
    create_r = client.post("/api/reports", json={"description": "Resolve me"}, headers=auth(USER_TOKEN))
    report_id = create_r.json()["id"]

    r = client.patch(f"/api/admin/reports/{report_id}/resolve", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 200

    reports = client.get("/api/admin/reports", headers=auth(ADMIN_TOKEN)).json()
    resolved = next(rep for rep in reports if rep["id"] == report_id)
    assert resolved["status"] == "resolved"


def test_resolve_nonexistent_report_returns_404(client):
    r = client.patch("/api/admin/reports/999999/resolve", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 404


def test_superadmin_can_delete_report(client):
    _ensure_user(client, USER_TOKEN)
    create_r = client.post("/api/reports", json={"description": "Delete me"}, headers=auth(USER_TOKEN))
    report_id = create_r.json()["id"]

    r = client.delete(f"/api/admin/reports/{report_id}", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 200

    reports = client.get("/api/admin/reports", headers=auth(ADMIN_TOKEN)).json()
    assert not any(rep["id"] == report_id for rep in reports)


def test_non_superadmin_cannot_delete_report(client):
    _ensure_user(client, USER_TOKEN)
    create_r = client.post("/api/reports", json={"description": "Cannot delete"}, headers=auth(USER_TOKEN))
    report_id = create_r.json()["id"]

    r = client.delete(f"/api/admin/reports/{report_id}", headers=auth(USER_TOKEN))
    assert r.status_code == 403


def test_delete_nonexistent_report_returns_404(client):
    r = client.delete("/api/admin/reports/999999", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 404
