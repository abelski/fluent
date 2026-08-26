# Autotests for the premium bypass of the sequential grammar lesson lock (#10).
#
# Two things are covered here:
#   1. Premium (and admin) users see every lesson unlocked and can fetch tasks for any
#      lesson out of order — both lesson families (cases: id < 200, verbs: id >= 200).
#   2. The lock is enforced server-side for free users. It used to be list-endpoint
#      metadata only (`is_locked`), so the task endpoints happily served a locked
#      lesson to anyone who asked by id; now they return 403, and the check runs
#      before the quota increment so a rejected attempt doesn't burn a session.
#
# Uses TestClient + in-memory SQLite (configured in backend/conftest.py).

from datetime import datetime

from jose import jwt
from sqlmodel import Session, select

import database
from models import GrammarCaseRule, GrammarLessonResult, User

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"

ADMIN_EMAIL = "artyrbelski@gmail.com"

# Lessons 1-3 in LESSON_CONFIG all cover case 4 — publishing that case makes them
# visible to non-admins, which is what get_lessons() filters on.
LESSON_CASE = 4


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _publish_lesson_case() -> None:
    """Publish case 4 so the first few case lessons are visible to non-admins."""
    with Session(database.engine) as s:
        existing = s.exec(select(GrammarCaseRule).where(GrammarCaseRule.case_index == LESSON_CASE)).first()
        if existing:
            existing.status = "published"
            s.add(existing)
        else:
            s.add(GrammarCaseRule(
                case_index=LESSON_CASE,
                name_ru="Галининкас",
                question="Кого? Что?",
                usage="test",
                endings_sg="-ą",
                endings_pl="-us",
                transform="test",
                status="published",
            ))
        s.commit()


def _user(client, email: str) -> str:
    """Ensure the user row exists (auto-created on first authed call). Returns user id."""
    client.get("/api/me/quota", headers=auth(make_token(email)))
    with Session(database.engine) as s:
        return s.exec(select(User).where(User.email == email)).first().id


def _make_premium(client, email: str) -> str:
    user_id = _user(client, email)
    with Session(database.engine) as s:
        user = s.get(User, user_id)
        user.is_premium = True
        user.premium_until = None  # None = no expiry
        s.add(user)
        s.commit()
    return user_id


def _sessions_today(client, token: str) -> int:
    return client.get("/api/me/quota", headers=auth(token)).json()["sessions_today"]


def _lessons(client, token: str | None = None) -> list[dict]:
    _publish_lesson_case()
    return client.get("/api/grammar/lessons", headers=auth(token) if token else {}).json()


def _verb_lessons(client, token: str | None = None) -> list[dict]:
    return client.get("/api/grammar/verb-lessons?program_type=verbs",
                      headers=auth(token) if token else {}).json()


def _first_locked_id(lessons: list[dict]) -> int | None:
    return next((l["id"] for l in lessons if l["is_locked"]), None)


# ── Free users: the lock is real, not cosmetic ───────────────────────────────

def test_free_user_sees_locked_case_lessons(client):
    token = make_token("grammar_lock_free_list@example.com")
    _user(client, "grammar_lock_free_list@example.com")
    lessons = _lessons(client, token)
    assert len(lessons) >= 2
    assert lessons[0]["is_locked"] is False
    assert _first_locked_id(lessons) is not None


def test_free_user_403_on_locked_case_lesson_tasks(client):
    email = "grammar_lock_free_case@example.com"
    token = make_token(email)
    _user(client, email)
    locked_id = _first_locked_id(_lessons(client, token))
    assert locked_id is not None

    r = client.get(f"/api/grammar/lessons/{locked_id}/tasks", headers=auth(token))
    assert r.status_code == 403
    assert "locked" in r.json()["detail"].lower()


def test_free_user_403_on_locked_verb_lesson_tasks(client):
    email = "grammar_lock_free_verb@example.com"
    token = make_token(email)
    _user(client, email)
    locked_id = _first_locked_id(_verb_lessons(client, token))
    assert locked_id is not None

    r = client.get(f"/api/grammar/verb-lessons/{locked_id}/tasks", headers=auth(token))
    assert r.status_code == 403


def test_rejected_attempt_does_not_consume_quota(client):
    """The lock check runs before quota_check_and_increment — a 403 costs nothing."""
    email = "grammar_lock_free_quota@example.com"
    token = make_token(email)
    _user(client, email)
    locked_id = _first_locked_id(_lessons(client, token))
    assert locked_id is not None

    before = _sessions_today(client, token)
    assert client.get(f"/api/grammar/lessons/{locked_id}/tasks", headers=auth(token)).status_code == 403
    assert _sessions_today(client, token) == before


def test_free_user_can_open_unlocked_lesson(client):
    """Sanity check that the gate isn't a blanket 403: the first lesson is open."""
    email = "grammar_lock_free_open@example.com"
    token = make_token(email)
    _user(client, email)
    first_id = _lessons(client, token)[0]["id"]

    r = client.get(f"/api/grammar/lessons/{first_id}/tasks", headers=auth(token))
    assert r.status_code == 200


def test_free_user_unlocks_next_lesson_by_passing(client):
    """Passing lesson N with > 75% unlocks lesson N+1 for a free user (rule unchanged)."""
    email = "grammar_lock_free_pass@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    lessons = _lessons(client, token)
    first_id, second_id = lessons[0]["id"], lessons[1]["id"]
    assert lessons[1]["is_locked"] is True

    with Session(database.engine) as s:
        s.add(GrammarLessonResult(user_id=user_id, lesson_id=first_id, score=10, total=10, passed=True))
        s.commit()

    assert _lessons(client, token)[1]["is_locked"] is False
    assert client.get(f"/api/grammar/lessons/{second_id}/tasks", headers=auth(token)).status_code == 200


# ── Premium: no lock at all ──────────────────────────────────────────────────

def test_premium_sees_every_case_lesson_unlocked(client):
    email = "grammar_lock_premium_list@example.com"
    token = make_token(email)
    _make_premium(client, email)
    lessons = _lessons(client, token)
    assert len(lessons) >= 2
    assert all(l["is_locked"] is False for l in lessons)


def test_premium_sees_every_verb_lesson_unlocked(client):
    email = "grammar_lock_premium_verbs@example.com"
    token = make_token(email)
    _make_premium(client, email)
    lessons = _verb_lessons(client, token)
    assert len(lessons) >= 2
    assert all(l["is_locked"] is False for l in lessons)


def test_premium_can_fetch_out_of_order_case_lesson_tasks(client):
    email = "grammar_lock_premium_case@example.com"
    free_token = make_token("grammar_lock_premium_case_ref@example.com")
    _user(client, "grammar_lock_premium_case_ref@example.com")
    locked_id = _first_locked_id(_lessons(client, free_token))  # locked for a free user
    assert locked_id is not None

    token = make_token(email)
    _make_premium(client, email)
    r = client.get(f"/api/grammar/lessons/{locked_id}/tasks", headers=auth(token))
    assert r.status_code == 200


def test_premium_can_fetch_out_of_order_verb_lesson_tasks(client):
    email = "grammar_lock_premium_verb@example.com"
    free_token = make_token("grammar_lock_premium_verb_ref@example.com")
    _user(client, "grammar_lock_premium_verb_ref@example.com")
    locked_id = _first_locked_id(_verb_lessons(client, free_token))
    assert locked_id is not None

    token = make_token(email)
    _make_premium(client, email)
    r = client.get(f"/api/grammar/verb-lessons/{locked_id}/tasks", headers=auth(token))
    assert r.status_code == 200


def test_expired_premium_is_still_locked(client):
    """premium_until in the past → is_premium_active() False → lock still applies."""
    email = "grammar_lock_expired@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    with Session(database.engine) as s:
        user = s.get(User, user_id)
        user.is_premium = True
        user.premium_until = datetime(2020, 1, 1)
        s.add(user)
        s.commit()

    lessons = _lessons(client, token)
    locked_id = _first_locked_id(lessons)
    assert locked_id is not None
    assert client.get(f"/api/grammar/lessons/{locked_id}/tasks", headers=auth(token)).status_code == 403


# ── Admin: same bypass ───────────────────────────────────────────────────────

def test_admin_bypasses_the_lock(client):
    admin_token = make_token(ADMIN_EMAIL, name="Artur")
    free_token = make_token("grammar_lock_admin_ref@example.com")
    _user(client, "grammar_lock_admin_ref@example.com")
    locked_id = _first_locked_id(_lessons(client, free_token))
    assert locked_id is not None

    lessons = _lessons(client, admin_token)
    assert all(l["is_locked"] is False for l in lessons)
    assert client.get(f"/api/grammar/lessons/{locked_id}/tasks", headers=auth(admin_token)).status_code == 200


# ── Unauthenticated: unaffected ──────────────────────────────────────────────

def test_unauthenticated_sees_everything_unlocked(client):
    lessons = _lessons(client)
    assert len(lessons) >= 2
    assert all(l["is_locked"] is False for l in lessons)
    verb_lessons = _verb_lessons(client)
    assert all(l["is_locked"] is False for l in verb_lessons)


def test_unauthenticated_can_fetch_any_lesson_tasks(client):
    free_token = make_token("grammar_lock_anon_ref@example.com")
    _user(client, "grammar_lock_anon_ref@example.com")
    locked_id = _first_locked_id(_lessons(client, free_token))
    assert locked_id is not None
    assert client.get(f"/api/grammar/lessons/{locked_id}/tasks").status_code == 200
