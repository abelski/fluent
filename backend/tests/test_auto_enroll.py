# Autotests for issue #146: new users are auto-enrolled into default word and
# phrase programs so the dashboard isn't empty on first login.
# Uses the shared TestClient + in-memory SQLite from conftest.py.

import pytest
from jose import jwt
from sqlmodel import Session, select

import constants
import database
from models import PhraseProgram, SubcategoryMeta, User, UserPhraseProgramEnrollment, UserProgram

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"

DEFAULT_KEY = "test_default_words"


def make_token(email: str) -> str:
    return jwt.encode(
        {"email": email, "name": "Test User", "picture": None},
        JWT_SECRET,
        algorithm=JWT_ALGORITHM,
    )


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def default_programs(monkeypatch):
    """Seed a published default word program and a public phrase program.

    Cleaned up afterwards so fresh users in other test files don't get
    auto-enrolled into leftovers.
    """
    monkeypatch.setattr(constants, "DEFAULT_WORD_PROGRAM_KEYS", [DEFAULT_KEY])
    with Session(database.engine) as s:
        meta = SubcategoryMeta(key=DEFAULT_KEY, name_ru="База", name_en="Basics", status="published")
        program = PhraseProgram(title="Starter Phrases", difficulty=1, is_public=True)
        s.add(meta)
        s.add(program)
        s.commit()
        s.refresh(meta)
        s.refresh(program)
        meta_id, program_id = meta.id, program.id
    yield program_id
    with Session(database.engine) as s:
        for model, row_id in ((SubcategoryMeta, meta_id), (PhraseProgram, program_id)):
            row = s.get(model, row_id)
            if row:
                s.delete(row)
        s.commit()


def test_new_user_auto_enrolled_in_defaults(client, default_programs):
    token = make_token("auto_enroll_new@example.com")
    # First authenticated request triggers require_user's auto-create path
    r = client.get("/api/me/programs", headers=auth_headers(token))
    assert r.status_code == 200
    assert DEFAULT_KEY in r.json()

    with Session(database.engine) as s:
        user = s.exec(select(User).where(User.email == "auto_enroll_new@example.com")).first()
        enrollment = s.exec(
            select(UserPhraseProgramEnrollment).where(
                UserPhraseProgramEnrollment.user_id == user.id,
                UserPhraseProgramEnrollment.program_id == default_programs,
            )
        ).first()
        assert enrollment is not None


def test_missing_default_key_does_not_break_login(client, monkeypatch):
    monkeypatch.setattr(constants, "DEFAULT_WORD_PROGRAM_KEYS", ["nonexistent_key_xyz"])
    token = make_token("auto_enroll_missing@example.com")
    r = client.get("/api/me/programs", headers=auth_headers(token))
    assert r.status_code == 200
    assert "nonexistent_key_xyz" not in r.json()


def test_unenrolled_user_not_re_enrolled(client, default_programs):
    token = make_token("auto_enroll_unenroll@example.com")
    r = client.get("/api/me/programs", headers=auth_headers(token))
    assert DEFAULT_KEY in r.json()

    # Deliberate unenroll must stick across later requests
    r = client.delete(f"/api/me/programs/{DEFAULT_KEY}", headers=auth_headers(token))
    assert r.status_code == 200
    r = client.get("/api/me/programs", headers=auth_headers(token))
    assert DEFAULT_KEY not in r.json()


def test_existing_user_login_does_not_enroll(client, default_programs):
    # User created BEFORE defaults existed (simulated by direct insert) must
    # not be enrolled by later requests — onboarding runs only at creation.
    email = "auto_enroll_existing@example.com"
    with Session(database.engine) as s:
        s.add(User(email=email, name="Old User"))
        s.commit()
    token = make_token(email)
    r = client.get("/api/me/programs", headers=auth_headers(token))
    assert r.status_code == 200
    assert r.json() == []
