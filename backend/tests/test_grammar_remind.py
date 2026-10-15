# Autotests for GET /api/grammar/remind/tasks — «Напомни что я мог забыть» (#26).
#
# A mixed run built from every «Повторение» (practice) lesson the user has already
# passed, in grammar programs they're enrolled in. Eligibility is checked BEFORE
# the daily-quota charge, so a 404 must never consume a session.
#
# Uses TestClient + in-memory SQLite (configured in backend/conftest.py). With no
# grammar_sentence rows seeded, noun lesson tasks fall back to declension tasks —
# see grammar_service._generate_sentence_tasks — which is fine for these tests.

from jose import jwt
from sqlmodel import Session, select

import database
from constants import DAILY_LIMIT
from models import GrammarCaseRule, GrammarLessonResult, GrammarProgram, User, UserGrammarProgram

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"

REMIND_URL = "/api/grammar/remind/tasks"

# Lessons 1-3 in LESSON_CONFIG all cover case 4 (1=basic, 2=advanced, 3=practice).
LESSON_CASE = 4
BASIC_LESSON_ID = 1
PRACTICE_LESSON_ID = 3

_GRAMMAR_PROGRAM_ID = 9401


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _user(client, email: str) -> str:
    """Ensure the user row exists (auto-created on first authed call). Returns user id."""
    client.get("/api/me/quota", headers=auth(make_token(email)))
    with Session(database.engine) as s:
        return s.exec(select(User).where(User.email == email)).first().id


def _sessions_today(client, token: str) -> int:
    return client.get("/api/me/quota", headers=auth(token)).json()["sessions_today"]


def _publish_lesson_case() -> None:
    """Publish case 4 so lessons 1-3 (basic/advanced/practice) are visible to non-admins."""
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


def _enroll_grammar(user_id: str, program_id: int = _GRAMMAR_PROGRAM_ID, lesson_filter: str | None = None) -> None:
    """Enroll the user in a grammar program, creating/updating it with the given filter."""
    with Session(database.engine) as s:
        program = s.get(GrammarProgram, program_id)
        if not program:
            s.add(GrammarProgram(
                id=program_id, title=f"Test remind program {program_id}",
                is_public=True, lesson_filter=lesson_filter,
            ))
        else:
            program.lesson_filter = lesson_filter
            s.add(program)
        s.commit()
        existing = s.exec(select(UserGrammarProgram).where(
            UserGrammarProgram.user_id == user_id, UserGrammarProgram.program_id == program_id,
        )).first()
        if not existing:
            s.add(UserGrammarProgram(user_id=user_id, program_id=program_id))
            s.commit()


def _pass_grammar_lesson(user_id: str, lesson_id: int, passed: bool = True) -> None:
    _publish_lesson_case()
    with Session(database.engine) as s:
        s.add(GrammarLessonResult(
            user_id=user_id, lesson_id=lesson_id,
            score=10 if passed else 1, total=10, passed=passed,
        ))
        s.commit()


# ── Auth ─────────────────────────────────────────────────────────────────────

def test_remind_requires_auth(client):
    assert client.get(REMIND_URL).status_code == 401


# ── Eligibility ──────────────────────────────────────────────────────────────

def test_no_passed_practice_lesson_returns_404_and_spends_nothing(client):
    email = "remind_no_practice@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_grammar(user_id, program_id=9402)
    _pass_grammar_lesson(user_id, BASIC_LESSON_ID, passed=True)  # basic, not practice

    before = _sessions_today(client, token)
    r = client.get(REMIND_URL, headers=auth(token))
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "no_passed_practice"
    assert _sessions_today(client, token) == before, "a 404 must never consume a session"


def test_passed_practice_lesson_in_enrolled_program_returns_tasks_and_spends_a_session(client):
    email = "remind_eligible@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_grammar(user_id, program_id=9403)
    _pass_grammar_lesson(user_id, PRACTICE_LESSON_ID, passed=True)

    before = _sessions_today(client, token)
    r = client.get(REMIND_URL, headers=auth(token))
    assert r.status_code == 200
    tasks = r.json()
    assert isinstance(tasks, list)
    assert len(tasks) == 10
    assert _sessions_today(client, token) == before + 1


def test_passed_practice_lesson_but_program_filter_excludes_its_case_returns_404(client):
    """Case 4's group is 'Vienaskaita' (singular) — a program scoped to only
    'Daugiskaita' (plural) lessons never includes lesson 3, even though the user
    passed it, because that lesson isn't part of THIS enrolled program."""
    email = "remind_filtered_out@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_grammar(user_id, program_id=9404, lesson_filter='["Daugiskaita"]')
    _pass_grammar_lesson(user_id, PRACTICE_LESSON_ID, passed=True)

    before = _sessions_today(client, token)
    r = client.get(REMIND_URL, headers=auth(token))
    assert r.status_code == 404
    assert _sessions_today(client, token) == before


def test_passed_practice_lesson_but_not_enrolled_anywhere_returns_404(client):
    email = "remind_not_enrolled@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _pass_grammar_lesson(user_id, PRACTICE_LESSON_ID, passed=True)  # no enrollment at all

    r = client.get(REMIND_URL, headers=auth(token))
    assert r.status_code == 404


# ── Quota ────────────────────────────────────────────────────────────────────

def test_free_user_at_daily_limit_gets_429(client):
    email = "remind_quota_limit@example.com"
    token = make_token(email)
    headers = auth(token)
    user_id = _user(client, email)
    _enroll_grammar(user_id, program_id=9405)
    _pass_grammar_lesson(user_id, PRACTICE_LESSON_ID, passed=True)

    quota = client.get("/api/me/quota", headers=headers).json()
    for _ in range(DAILY_LIMIT - quota["sessions_today"]):
        assert client.get("/api/lists/1/study", headers=headers).status_code == 200

    r = client.get(REMIND_URL, headers=headers)
    assert r.status_code == 429
    assert r.json()["detail"]["code"] == "daily_limit_reached"


# ── Result save (sentinel id never counts as a real lesson) ──────────────────

def test_remind_result_does_not_bump_lessons_passed_but_counts_for_streak(client):
    email = "remind_result_save@example.com"
    token = make_token(email)
    headers = auth(token)
    _user(client, email)

    before_stats = client.get("/api/me/stats", headers=headers).json()
    r = client.post("/api/grammar/lessons/0/results", json={"score": 10, "total": 10}, headers=headers)
    assert r.status_code == 200
    assert r.json()["passed"] is True

    stats = client.get("/api/me/stats", headers=headers).json()
    assert stats["grammar_lessons_passed"] == before_stats["grammar_lessons_passed"], \
        "the remind sentinel (lesson_id=0) must never count as a passed lesson"
    assert stats["streak"] >= 1


# ── Scoped to one program, weakest first (#66) ───────────────────────────────

SECOND_PRACTICE_LESSON_ID = 6  # Vietininkas Vns. (case 6), practice level


def _publish_case(case_index: int) -> None:
    with Session(database.engine) as s:
        existing = s.exec(select(GrammarCaseRule).where(GrammarCaseRule.case_index == case_index)).first()
        if existing:
            existing.status = "published"
            s.add(existing)
        else:
            s.add(GrammarCaseRule(
                case_index=case_index, name_ru=f"case {case_index}", question="?", usage="test",
                endings_sg="-", endings_pl="-", transform="test", status="published",
            ))
        s.commit()


def _add_result(user_id: str, lesson_id: int, score: int, total: int = 10) -> None:
    with Session(database.engine) as s:
        s.add(GrammarLessonResult(user_id=user_id, lesson_id=lesson_id, score=score, total=total,
                                  passed=score / total > 0.75))
        s.commit()


def test_program_scope_ignores_lessons_passed_in_other_programs(client):
    """Lesson 3 (singular) is passed and belongs to the unfiltered program; a program
    scoped to plural lessons has nothing eligible, so the scoped run 404s while the
    unscoped one still works."""
    email = "remind_scope@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_grammar(user_id, program_id=9411)                                   # all noun lessons
    _enroll_grammar(user_id, program_id=9412, lesson_filter='["Daugiskaita"]')  # plural only
    _pass_grammar_lesson(user_id, PRACTICE_LESSON_ID, passed=True)

    before = _sessions_today(client, token)
    r = client.get(REMIND_URL, params={"program_id": 9412}, headers=auth(token))
    assert r.status_code == 404
    assert r.json()["detail"]["code"] == "no_passed_practice"
    assert _sessions_today(client, token) == before, "a 404 must never consume a session"

    assert client.get(REMIND_URL, params={"program_id": 9411}, headers=auth(token)).status_code == 200
    assert client.get(REMIND_URL, headers=auth(token)).status_code == 200


def test_program_scope_not_enrolled_returns_403_and_spends_nothing(client):
    email = "remind_scope_not_enrolled@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_grammar(user_id, program_id=9413)
    _pass_grammar_lesson(user_id, PRACTICE_LESSON_ID, passed=True)
    with Session(database.engine) as s:  # a public program the user never enrolled in
        if not s.get(GrammarProgram, 9414):
            s.add(GrammarProgram(id=9414, title="Not mine", is_public=True))
            s.commit()

    before = _sessions_today(client, token)
    r = client.get(REMIND_URL, params={"program_id": 9414}, headers=auth(token))
    assert r.status_code == 403
    assert r.json()["detail"]["code"] == "not_enrolled"
    assert _sessions_today(client, token) == before


def test_program_scope_unknown_program_returns_404(client):
    email = "remind_scope_unknown@example.com"
    token = make_token(email)
    _user(client, email)
    r = client.get(REMIND_URL, params={"program_id": 999999}, headers=auth(token))
    assert r.status_code == 404


def test_program_scope_draws_the_weakest_lesson_first(client, monkeypatch):
    """With room for one lesson, the scoped run must pick the lowest best score (80%
    on lesson 6) over the stronger one (100% on lesson 3). Tasks are stubbed to carry
    their lesson id so the choice is visible."""
    import routers.grammar as grammar_router
    monkeypatch.setattr(grammar_router, "REMIND_TASK_COUNT", 1)
    monkeypatch.setattr(grammar_router, "get_lesson_tasks", lambda lid, s: [{"lesson": lid}] * 5)

    email = "remind_weakest@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _publish_lesson_case()
    _publish_case(6)
    _enroll_grammar(user_id, program_id=9415)
    _add_result(user_id, PRACTICE_LESSON_ID, 10)          # 100%
    _add_result(user_id, SECOND_PRACTICE_LESSON_ID, 8)    # 80% — weakest passed
    _add_result(user_id, SECOND_PRACTICE_LESSON_ID, 2)    # failed attempt never counts as best

    for _ in range(5):  # unscoped picks at random; scoped must be deterministic
        r = client.get(REMIND_URL, params={"program_id": 9415}, headers=auth(token))
        assert r.status_code == 200
        assert r.json() == [{"lesson": SECOND_PRACTICE_LESSON_ID}]


def test_remind_lesson_order_unit():
    from routers.grammar import _remind_lesson_order
    best = {3: 1.0, 6: 0.8, 12: 0.9}
    assert _remind_lesson_order([3, 6, 12], best, weakest_first=True) == [6, 12, 3]
    assert sorted(_remind_lesson_order([3, 6, 12], best, weakest_first=False)) == [3, 6, 12]
