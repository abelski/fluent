# Autotests for the combined "Продолжить занятие" session — GET /api/me/continue-session
# and its settings endpoint GET/PATCH /me/continue-settings.
#
# The endpoint stitches three phases (words → grammar → phrases) into ONE session and
# must charge the non-premium daily quota exactly once for the whole thing, and only
# when at least one phase actually has content. A hard enrollment gate runs before any
# of that: zero enrollment in any of words/grammar/phrases blocks the whole session.
#
# Uses TestClient + in-memory SQLite (configured in backend/conftest.py).

from datetime import date, datetime, timedelta

from jose import jwt
from sqlmodel import Session, select

import database
from models import (
    GrammarCaseRule,
    GrammarLessonResult,
    GrammarProgram,
    Phrase,
    PhraseProgram,
    User,
    UserGrammarProgram,
    UserPhraseProgramEnrollment,
    UserPhraseProgress,
    UserProgram,
    UserWordProgress,
    Word,
    WordList,
    WordListItem,
)

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"

# Lesson 1 in LESSON_CONFIG covers case 4 — publishing that case makes the lesson
# visible to non-admins, which is what get_lessons() filters on.
LESSON_ID = 1
LESSON_CASE = 4


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


# ── Enrollment (the hard gate's precondition) ────────────────────────────────

_WORDS_SUBCATEGORY = "test_program"
_GRAMMAR_PROGRAM_ID = 9301
_PHRASE_PROGRAM_ID = 9201


def _enroll_words(user_id: str, subcategory: str = _WORDS_SUBCATEGORY) -> None:
    with Session(database.engine) as s:
        existing = s.exec(select(UserProgram).where(
            UserProgram.user_id == user_id, UserProgram.subcategory_key == subcategory,
        )).first()
        if not existing:
            s.add(UserProgram(user_id=user_id, subcategory_key=subcategory))
            s.commit()


def _enroll_grammar(user_id: str) -> None:
    with Session(database.engine) as s:
        if not s.get(GrammarProgram, _GRAMMAR_PROGRAM_ID):
            s.add(GrammarProgram(id=_GRAMMAR_PROGRAM_ID, title="Test grammar program", is_public=True))
            s.commit()
        existing = s.exec(select(UserGrammarProgram).where(
            UserGrammarProgram.user_id == user_id, UserGrammarProgram.program_id == _GRAMMAR_PROGRAM_ID,
        )).first()
        if not existing:
            s.add(UserGrammarProgram(user_id=user_id, program_id=_GRAMMAR_PROGRAM_ID))
            s.commit()


def _enroll_phrases(user_id: str) -> None:
    with Session(database.engine) as s:
        if not s.get(PhraseProgram, _PHRASE_PROGRAM_ID):
            s.add(PhraseProgram(id=_PHRASE_PROGRAM_ID, title="Continue phrases", is_public=True))
            s.commit()
        existing = s.exec(select(UserPhraseProgramEnrollment).where(
            UserPhraseProgramEnrollment.user_id == user_id,
            UserPhraseProgramEnrollment.program_id == _PHRASE_PROGRAM_ID,
        )).first()
        if not existing:
            s.add(UserPhraseProgramEnrollment(user_id=user_id, program_id=_PHRASE_PROGRAM_ID))
            s.commit()


def _enroll_all(user_id: str) -> None:
    """Past the hard gate: one program per category. Doesn't guarantee any phase has
    content — that's still driven by progress/passed-lesson/due-phrase state."""
    _enroll_words(user_id)
    _enroll_grammar(user_id)
    _enroll_phrases(user_id)


# ── Content fixtures ──────────────────────────────────────────────────────────

def _publish_lesson_case() -> None:
    """Publish the case behind LESSON_ID so get_lessons() exposes it to non-admins."""
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


def _pass_grammar_lesson(user_id: str, lesson_id: int = LESSON_ID, passed: bool = True) -> None:
    _publish_lesson_case()
    with Session(database.engine) as s:
        s.add(GrammarLessonResult(
            user_id=user_id,
            lesson_id=lesson_id,
            score=10 if passed else 1,
            total=10,
            passed=passed,
        ))
        s.commit()


def _known_words(client, token: str, count: int) -> None:
    """Mark `count` words as known and due (no next_review → always due)."""
    word_ids = _ensure_words(count)
    for wid in word_ids:
        r = client.post(f"/api/words/{wid}/progress", json={"status": "known", "mistake": False}, headers=auth(token))
        assert r.status_code == 200


_EXTRA_WORDS_LIST_ID = 9101


def _ensure_words(count: int) -> list[int]:
    """Return ids of at least `count` words, creating a spare pool list on first use.

    Lives under _WORDS_SUBCATEGORY so _enroll_words() + a "new" word for this pool
    line up — a word only counts as a combined-training "new" candidate when it's in
    a list under a subcategory the user is actually enrolled in.
    """
    with Session(database.engine) as s:
        existing = s.exec(select(Word).where(Word.id >= 9000, Word.id < 9500)).all()
        if len(existing) < count:
            wl = s.get(WordList, _EXTRA_WORDS_LIST_ID)
            if not wl:
                s.add(WordList(id=_EXTRA_WORDS_LIST_ID, title="Continue pool", is_public=True,
                               subcategory=_WORDS_SUBCATEGORY))
            for i in range(len(existing), count):
                wid = 9000 + i
                s.add(Word(id=wid, lithuanian=f"zodis{i}", translation_en=f"word{i}", translation_ru=f"слово{i}"))
                s.add(WordListItem(word_list_id=_EXTRA_WORDS_LIST_ID, word_id=wid, position=i))
            s.commit()
        return [9000 + i for i in range(count)]


def _due_phrases(user_id: str, count: int) -> None:
    """Enroll the user in a phrase program and mark `count` phrases due for review."""
    _enroll_phrases(user_id)
    with Session(database.engine) as s:
        existing = s.exec(select(Phrase).where(Phrase.program_id == _PHRASE_PROGRAM_ID)).all()
        for i in range(len(existing), count):
            s.add(Phrase(
                id=9200 + i,
                program_id=_PHRASE_PROGRAM_ID,
                text=f"Frazė numeris {i}",
                translation=f"Фраза номер {i}",
                translation_en=f"Phrase number {i}",
                position=i,
            ))
        s.commit()

        yesterday = date.today() - timedelta(days=1)
        for i in range(count):
            s.add(UserPhraseProgress(
                user_id=user_id,
                phrase_id=9200 + i,
                lesson_stage=2,
                next_review=yesterday,
            ))
        s.commit()


def _set_phrases_per_session(user_id: str, n: int) -> None:
    with Session(database.engine) as s:
        user = s.get(User, user_id)
        user.phrases_per_session = n
        s.add(user)
        s.commit()


def _set_continue_settings(
    client, token: str,
    words: int = 3, grammar: int = 3, phrases: int = 3, include_new: bool = False,
):
    r = client.patch("/api/me/continue-settings", json={
        "continue_words_count": words,
        "continue_grammar_count": grammar,
        "continue_phrases_count": phrases,
        "continue_include_new": include_new,
    }, headers=auth(token))
    assert r.status_code == 200
    return r.json()


# ── Auth ─────────────────────────────────────────────────────────────────────

def test_continue_session_requires_auth(client):
    assert client.get("/api/me/continue-session").status_code == 401


def test_continue_settings_requires_auth(client):
    assert client.get("/api/me/continue-settings").status_code == 401
    assert client.patch("/api/me/continue-settings", json={
        "continue_words_count": 3, "continue_grammar_count": 3,
        "continue_phrases_count": 3, "continue_include_new": True,
    }).status_code == 401


# ── Enrollment gate ────────────────────────────────────────────────────────────

def test_needs_enrollment_lists_all_three_when_enrolled_in_nothing(client):
    """Every new user is auto-enrolled in a starter phrase program on creation
    (backend/onboarding.py's enroll_default_programs) — real behaviour, but it would
    make this test order-dependent (only "fresh" if no public PhraseProgram exists
    yet anywhere in the shared test DB). Clear it explicitly so "enrolled in
    nothing" holds regardless of what other tests ran first."""
    email = "continue_gate_none@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    with Session(database.engine) as s:
        for auto_enrollment in s.exec(
            select(UserPhraseProgramEnrollment).where(UserPhraseProgramEnrollment.user_id == user_id)
        ).all():
            s.delete(auto_enrollment)
        s.commit()
    before = _sessions_today(client, token)

    r = client.get("/api/me/continue-session", headers=auth(token))
    assert r.status_code == 200
    data = r.json()
    assert sorted(data["needs_enrollment"]) == ["grammar", "phrases", "words"]
    assert data["phases"] == []
    assert data["words"] == [] and data["grammar"] is None and data["phrases"] == []
    assert _sessions_today(client, token) == before, "the gate must never charge quota"


def test_needs_enrollment_names_only_the_missing_category(client):
    email = "continue_gate_grammar_only@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_words(user_id)
    _enroll_phrases(user_id)
    # grammar deliberately left unenrolled

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert data["needs_enrollment"] == ["grammar"]
    assert data["phases"] == []


def test_no_needs_enrollment_once_all_three_enrolled(client):
    """Enrolled everywhere but nothing is due/passed/new: empty payload, no gate,
    no charge — this is "enrolled, nothing to do" not "never enrolled"."""
    email = "continue_gate_satisfied_empty@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    # Review-only: with include_new defaulting to True, "nothing to do" can't be
    # guaranteed once other tests have populated the shared word/phrase pools this
    # user is now enrolled into — review pools are keyed to this user's own progress
    # rows, so they stay genuinely empty regardless of what other tests created.
    _set_continue_settings(client, token, include_new=False)
    before = _sessions_today(client, token)

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert data["needs_enrollment"] == []
    assert data["phases"] == []
    assert _sessions_today(client, token) == before


# ── continue-settings ──────────────────────────────────────────────────────────

def test_continue_settings_defaults(client):
    email = "continue_settings_defaults@example.com"
    token = make_token(email)
    _user(client, email)

    data = client.get("/api/me/continue-settings", headers=auth(token)).json()
    assert data == {
        "continue_words_count": 3,
        "continue_grammar_count": 3,
        "continue_phrases_count": 3,
        "continue_include_new": True,
    }


def test_continue_settings_patch_persists(client):
    email = "continue_settings_patch@example.com"
    token = make_token(email)
    _user(client, email)

    updated = _set_continue_settings(client, token, words=5, grammar=2, phrases=7, include_new=False)
    assert updated == {
        "continue_words_count": 5,
        "continue_grammar_count": 2,
        "continue_phrases_count": 7,
        "continue_include_new": False,
    }
    # Round-trips on a fresh GET, not just echoed back from the PATCH response.
    assert client.get("/api/me/continue-settings", headers=auth(token)).json() == updated


def test_continue_settings_rejects_out_of_range_counts(client):
    email = "continue_settings_bounds@example.com"
    token = make_token(email)
    _user(client, email)

    for bad in (0, 21, -1):
        r = client.patch("/api/me/continue-settings", json={
            "continue_words_count": bad, "continue_grammar_count": 3,
            "continue_phrases_count": 3, "continue_include_new": True,
        }, headers=auth(token))
        assert r.status_code == 422, f"count={bad} should have been rejected"


# ── Empty pools (enrolled, nothing eligible yet) ──────────────────────────────

def test_grammar_phase_omitted_without_passed_lessons(client):
    email = "continue_no_grammar@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token)
    _known_words(client, token, 3)

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert "words" in data["phases"]
    assert "grammar" not in data["phases"]
    assert data["grammar"] is None


def test_grammar_phase_omitted_when_lesson_not_passed(client):
    email = "continue_failed_grammar@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token)
    _known_words(client, token, 3)
    _pass_grammar_lesson(user_id, passed=False)

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert "grammar" not in data["phases"]
    assert data["grammar"] is None


def test_words_phase_omitted_when_no_due_known_words(client):
    email = "continue_no_words@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token)
    _pass_grammar_lesson(user_id)

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert data["phases"] == ["grammar"]
    assert data["words"] == []


def test_words_phase_skips_archived_words_at_front_of_queue(client):
    """Regression: the words phase must not come back empty just because the
    most-overdue entries happen to be archived words. Found live on a real account
    where the top 5 "due known" words by (next_review, last_seen) ordering were all
    archived — a `limit=3` fetch-then-filter query returned zero words even though
    35+ eligible ones existed further down the list.

    Uses its own word id range (9500+), not the shared `_ensure_words()` pool —
    this test permanently archives some words, which would otherwise corrupt that
    pool for every other test in this file that reuses it."""
    email = "continue_archived_first@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token)

    word_ids = list(range(9500, 9505))
    with Session(database.engine) as s:
        base_time = datetime(2020, 1, 1)
        for i, wid in enumerate(word_ids):
            s.add(Word(
                id=wid, lithuanian=f"archtest{i}", translation_en=f"archtest{i}",
                translation_ru=f"archtest{i}", archived=(i < 3),  # front 3 archived
            ))
            s.add(UserWordProgress(
                user_id=user_id, word_id=wid, status="known",
                next_review=None, last_seen=base_time + timedelta(minutes=i),
            ))
        s.commit()

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert "words" in data["phases"]
    returned_ids = {w["id"] for w in data["words"]}
    assert returned_ids, "words phase came back empty despite 2 eligible non-archived words"
    assert returned_ids.issubset(set(word_ids[3:])), "returned an archived word"


def test_phrases_phase_omitted_when_no_due_phrases(client):
    email = "continue_no_phrases@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token)
    _known_words(client, token, 3)

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert "phrases" not in data["phases"]
    assert data["phrases"] == []


# ── Full 3-phase payload (include_new=False: today's shipped review-only shape) ─

def test_all_three_phases_in_order_with_expected_counts(client):
    email = "continue_full@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token, words=3, grammar=3, phrases=3, include_new=False)

    _known_words(client, token, 8)
    _pass_grammar_lesson(user_id)
    _due_phrases(user_id, 8)

    r = client.get("/api/me/continue-session", headers=auth(token))
    assert r.status_code == 200
    data = r.json()

    assert data["phases"] == ["words", "grammar", "phrases"]
    assert data["needs_enrollment"] == []
    assert len(data["words"]) == 3
    assert len(data["phrases"]) == 3
    assert len(data["grammar"]["tasks"]) == 3

    # Response shape the frontend phases rely on
    assert set(data.keys()) == {"phases", "words", "grammar", "phrases", "needs_enrollment"}
    assert data["grammar"]["lesson_id"] == LESSON_ID
    assert data["grammar"]["level"] in ("basic", "advanced", "practice")
    assert isinstance(data["grammar"]["rules"], list)
    assert "hint" in data["grammar"]
    for word in data["words"]:
        assert {"id", "lithuanian", "translation_ru", "translation_en", "status"} <= set(word)
        assert word["status"] == "known", "include_new=False must not surface a new word"
    for phrase in data["phrases"]:
        assert {"id", "text", "translation", "lesson_stage", "blank_word"} <= set(phrase)


def test_phase_counts_follow_continue_settings(client):
    """Each phase's count comes directly from continue-settings now, independently
    of words_per_session/phrases_per_session."""
    email = "continue_custom_counts@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token, words=1, grammar=1, phrases=1, include_new=False)

    _known_words(client, token, 8)
    _pass_grammar_lesson(user_id)
    _due_phrases(user_id, 8)

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert len(data["words"]) == 1
    assert len(data["grammar"]["tasks"]) == 1
    assert len(data["phrases"]) == 1


def test_words_per_session_no_longer_affects_continue_word_count(client):
    """The old round(words_per_session * 0.3) derivation is gone — a large
    words_per_session must not change the combined-training word count."""
    email = "continue_settings_independent@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token, words=2, grammar=1, phrases=1, include_new=False)
    assert client.patch("/api/me/settings", json={"words_per_session": 40, "new_words_ratio": 0.7},
                        headers=auth(token)).status_code == 200
    _known_words(client, token, 8)
    _pass_grammar_lesson(user_id)
    _due_phrases(user_id, 8)

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert len(data["words"]) == 2


# ── include_new ────────────────────────────────────────────────────────────────

def test_include_new_true_can_surface_a_brand_new_word(client):
    email = "continue_new_word@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token, words=3, include_new=True)
    _ensure_words(3)  # in the enrolled subcategory's list, never answered → all "new"

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert len(data["words"]) == 3
    assert any(w["status"] == "new" for w in data["words"]), \
        "include_new=True with only unseen words available must surface at least one"


def test_include_new_false_never_surfaces_a_new_word(client):
    """Same fixture as above, toggle off — must reproduce the pre-feature shape:
    an unseen word is never included when the user asked for review-only."""
    email = "continue_no_new_word@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token, words=3, include_new=False)
    _ensure_words(3)

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert data["words"] == [], "no known/due words and include_new=False → nothing to show"


def test_include_new_true_can_surface_a_brand_new_phrase(client):
    """Uses its own dedicated phrase program (9260), not the shared
    _PHRASE_PROGRAM_ID pool — that pool accumulates phrases across every test that
    calls _due_phrases(), and since "new" means "any phrase in an enrolled program
    with no progress row for this user", a fresh user enrolled in the shared program
    would see every earlier test's leftover phrases as "new" too, making this
    assertion depend on test execution order.

    Also clears whatever `enroll_default_programs` (backend/onboarding.py) auto-
    enrolled this brand-new user into on creation — real behaviour (every new user
    gets a starter phrase program), but it picks whichever public program happens to
    exist first, which is exactly the order-dependence this test is trying to avoid."""
    email = "continue_new_phrase@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_words(user_id)
    _enroll_grammar(user_id)
    _set_continue_settings(client, token, phrases=3, include_new=True)

    dedicated_program_id = 9260
    with Session(database.engine) as s:
        for auto_enrollment in s.exec(
            select(UserPhraseProgramEnrollment).where(UserPhraseProgramEnrollment.user_id == user_id)
        ).all():
            s.delete(auto_enrollment)
        if not s.get(PhraseProgram, dedicated_program_id):
            s.add(PhraseProgram(id=dedicated_program_id, title="Isolated new-phrase test program", is_public=True))
        for i in range(3):
            s.add(Phrase(
                id=9250 + i, program_id=dedicated_program_id,
                text=f"Nauja frazė {i}", translation=f"Новая фраза {i}", position=i,
            ))
        s.add(UserPhraseProgramEnrollment(user_id=user_id, program_id=dedicated_program_id))
        s.commit()

    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert data["needs_enrollment"] == []
    assert len(data["phrases"]) == 3
    returned_ids = {p["id"] for p in data["phrases"]}
    assert returned_ids == {9250, 9251, 9252}


def test_include_new_true_widens_grammar_pool_to_unlocked_unpassed_lesson(client):
    """With zero passed lessons, review-only (include_new=False) has nothing to offer;
    include_new=True should surface the first (unlocked-by-default) lesson instead."""
    email = "continue_new_grammar@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _publish_lesson_case()

    _set_continue_settings(client, token, grammar=1, include_new=False)
    assert client.get("/api/me/continue-session", headers=auth(token)).json()["grammar"] is None

    _set_continue_settings(client, token, grammar=1, include_new=True)
    data = client.get("/api/me/continue-session", headers=auth(token)).json()
    assert data["grammar"] is not None
    assert data["grammar"]["lesson_id"] == LESSON_ID


def test_locked_lesson_never_selected_even_with_include_new(client):
    """Discover a real locked lesson id for a fresh user (no grammar history at all —
    only the first lesson overall, and the first lesson of any enrolled program, is
    unlocked by default) and confirm the combined session never offers it, across
    many draws, even with include_new=True."""
    email = "continue_locked_lesson@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token, grammar=1, include_new=True)

    lessons = client.get("/api/grammar/lessons", headers=auth(token)).json()
    locked_ids = {l["id"] for l in lessons if l["is_locked"]}
    if not locked_ids:
        return  # nothing locked in this content set — nothing to assert

    # Each successful draw charges one daily session; stay safely under DAILY_LIMIT
    # (10) for this fresh user rather than racing into a 429.
    for _ in range(8):
        r = client.get("/api/me/continue-session", headers=auth(token))
        if r.status_code == 429:
            break
        data = r.json()
        if data["grammar"] is not None:
            assert data["grammar"]["lesson_id"] not in locked_ids


# ── Quota ────────────────────────────────────────────────────────────────────

def test_quota_charged_exactly_once_for_the_whole_session(client):
    email = "continue_quota_once@example.com"
    token = make_token(email)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token)
    _known_words(client, token, 3)
    _pass_grammar_lesson(user_id)
    _due_phrases(user_id, 3)

    before = _sessions_today(client, token)
    r = client.get("/api/me/continue-session", headers=auth(token))
    assert r.status_code == 200
    assert len(r.json()["phases"]) == 3
    assert _sessions_today(client, token) == before + 1


def test_returns_429_when_daily_limit_already_reached(client):
    email = "continue_quota_limit@example.com"
    token = make_token(email)
    headers = auth(token)
    user_id = _user(client, email)
    _enroll_all(user_id)
    _set_continue_settings(client, token)
    _known_words(client, token, 3)

    quota = client.get("/api/me/quota", headers=headers).json()
    for _ in range(10 - quota["sessions_today"]):
        assert client.get("/api/lists/1/study", headers=headers).status_code == 200

    r = client.get("/api/me/continue-session", headers=headers)
    assert r.status_code == 429
    detail = r.json()["detail"]
    assert detail["code"] == "daily_limit_reached"
    assert detail["limit"] == 10

    # Still capped — the refused call must not have incremented anything.
    assert _sessions_today(client, token) == 10
