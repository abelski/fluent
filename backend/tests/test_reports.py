# Tests for mistake-report endpoints.
import pytest
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


# ── Status-change reporter notifications ───────────────────────────────────


class _EmailRecorder:
    def __init__(self):
        self.calls: list[tuple[str, str, str]] = []

    def __call__(self, to: str, subject: str, body: str) -> None:
        self.calls.append((to, subject, body))


def _set_email_consent(email: str, consent: bool) -> None:
    with Session(_test_engine) as s:
        u = s.exec(select(User).where(User.email == email)).first()
        assert u is not None
        u.email_consent = consent
        s.add(u)
        s.commit()


@pytest.fixture
def email_recorder(monkeypatch):
    """Replace email_service.send_email with a recorder. Also ensures the
    reporter has email_consent=True so notifications fire."""
    recorder = _EmailRecorder()
    monkeypatch.setattr(email_service, "send_email", recorder)
    _set_email_consent("report_user@example.com", True)
    return recorder


def test_resolve_notifies_reporter(client, email_recorder):
    _ensure_user(client, USER_TOKEN)
    rid = client.post("/api/reports", json={"description": "Notify on resolve"}, headers=auth(USER_TOKEN)).json()["id"]

    r = client.patch(f"/api/admin/reports/{rid}/resolve", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 200
    assert len(email_recorder.calls) == 1
    to, subject, body = email_recorder.calls[0]
    assert to == "report_user@example.com"
    assert "обновлена" in subject and "updated" in subject
    assert "исправили" in body  # RU resolved copy
    assert "fixed" in body       # EN resolved copy


def test_hold_notifies_reporter(client, email_recorder):
    _ensure_user(client, USER_TOKEN)
    rid = client.post("/api/reports", json={"description": "Notify on hold"}, headers=auth(USER_TOKEN)).json()["id"]

    r = client.patch(f"/api/admin/reports/{rid}/hold", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 200
    assert len(email_recorder.calls) == 1
    _, _, body = email_recorder.calls[0]
    assert "отложили" in body
    assert "on hold" in body


def test_reopen_notifies_reporter(client, email_recorder):
    _ensure_user(client, USER_TOKEN)
    rid = client.post("/api/reports", json={"description": "Notify on reopen"}, headers=auth(USER_TOKEN)).json()["id"]
    client.patch(f"/api/admin/reports/{rid}/resolve", headers=auth(ADMIN_TOKEN))
    email_recorder.calls.clear()

    r = client.patch(f"/api/admin/reports/{rid}/reopen", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 200
    assert len(email_recorder.calls) == 1
    _, _, body = email_recorder.calls[0]
    assert "вернули" in body
    assert "reopened" in body


def test_no_notification_when_email_consent_false(client, monkeypatch):
    recorder = _EmailRecorder()
    monkeypatch.setattr(email_service, "send_email", recorder)
    _ensure_user(client, USER_TOKEN)
    _set_email_consent("report_user@example.com", False)
    try:
        rid = client.post("/api/reports", json={"description": "No email please"}, headers=auth(USER_TOKEN)).json()["id"]
        r = client.patch(f"/api/admin/reports/{rid}/resolve", headers=auth(ADMIN_TOKEN))
        assert r.status_code == 200
        assert recorder.calls == []
    finally:
        _set_email_consent("report_user@example.com", True)


def test_status_change_succeeds_if_email_raises(client, monkeypatch):
    def boom(*_args, **_kwargs):
        raise RuntimeError("SMTP not configured")
    monkeypatch.setattr(email_service, "send_email", boom)
    _ensure_user(client, USER_TOKEN)
    _set_email_consent("report_user@example.com", True)

    rid = client.post("/api/reports", json={"description": "SMTP down"}, headers=auth(USER_TOKEN)).json()["id"]
    r = client.patch(f"/api/admin/reports/{rid}/resolve", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 200

    reports = client.get("/api/admin/reports", headers=auth(ADMIN_TOKEN)).json()
    assert next(rep for rep in reports if rep["id"] == rid)["status"] == "resolved"


# ── Reopen endpoint ────────────────────────────────────────────────────────


def test_admin_can_reopen_report(client, monkeypatch):
    monkeypatch.setattr(email_service, "send_email", _EmailRecorder())
    _ensure_user(client, USER_TOKEN)
    rid = client.post("/api/reports", json={"description": "Reopen me"}, headers=auth(USER_TOKEN)).json()["id"]
    client.patch(f"/api/admin/reports/{rid}/resolve", headers=auth(ADMIN_TOKEN))

    r = client.patch(f"/api/admin/reports/{rid}/reopen", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 200

    reports = client.get("/api/admin/reports", headers=auth(ADMIN_TOKEN)).json()
    assert next(rep for rep in reports if rep["id"] == rid)["status"] == "open"


def test_reopen_nonexistent_report_returns_404(client, monkeypatch):
    monkeypatch.setattr(email_service, "send_email", _EmailRecorder())
    r = client.patch("/api/admin/reports/999999/reopen", headers=auth(ADMIN_TOKEN))
    assert r.status_code == 404


def test_non_admin_cannot_reopen_report(client, monkeypatch):
    monkeypatch.setattr(email_service, "send_email", _EmailRecorder())
    _ensure_user(client, USER_TOKEN)
    rid = client.post("/api/reports", json={"description": "No reopen for users"}, headers=auth(USER_TOKEN)).json()["id"]
    r = client.patch(f"/api/admin/reports/{rid}/reopen", headers=auth(USER_TOKEN))
    assert r.status_code == 403
