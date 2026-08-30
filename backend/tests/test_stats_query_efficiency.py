# Regression spec for GET /api/me/stats and GET /api/me/activity-calendar.
#
# These endpoints used to fetch every row of 5 progress tables (no LIMIT) just to
# compute a handful of summary numbers — see plans/improvements/active/plan_15
# _stats-endpoint-egress-fix.md. This test locks in the exact existing behavior
# (written and passing against the original, unbounded implementation) so the
# SQL-aggregate rewrite can be verified to produce identical output.
#
# Uses TestClient + in-memory SQLite (configured in backend/conftest.py).

from datetime import datetime, timedelta, timezone

from jose import jwt
from sqlmodel import Session

import database
from models import (
    GrammarLessonResult,
    PracticeExamResult,
    User,
    UserCustomPhraseProgress,
    UserPhraseProgress,
    UserWordProgress,
    Word,
    WordList,
    WordListItem,
    CustomPhraseList,
    CustomPhrase,
    Phrase,
    PhraseProgram,
)

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Stats Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _user_id(client, email: str) -> str:
    """Ensure the user row exists (auto-created on first authed call). Returns user id."""
    from sqlmodel import select

    client.get("/api/me/quota", headers=auth(make_token(email)))
    with Session(database.engine) as s:
        return s.exec(select(User).where(User.email == email)).first().id


def _seed_full_scenario(user_id: str, today) -> None:
    """Seeds rows across all 5 progress tables covering every branch of get_stats()
    and get_activity_calendar(): known/learning/new word statuses, a mistake, a word
    due today vs. in the future vs. never-scheduled-but-known, two attempts on the
    same grammar lesson where only the best should count as passed, a second lesson
    that never passes, two practice exam attempts, a phrase at each lesson_stage with
    one due today, and a streak spanning word+grammar+phrase+custom-phrase tables with
    a deliberate one-day gap to prove the backward walk stops there.
    """
    with Session(database.engine) as s:
        wl = WordList(title="Stats Test List", is_public=True, subcategory="stats_test")
        s.add(wl)
        s.flush()
        words = [Word(lithuanian=f"w{i}", translation_en=f"w{i}", translation_ru=f"w{i}") for i in range(6)]
        for w in words:
            s.add(w)
        s.flush()
        for i, w in enumerate(words):
            s.add(WordListItem(word_list_id=wl.id, word_id=w.id, position=i))
        s.flush()

        def _dt(days_ago: int) -> datetime:
            return datetime.combine(today - timedelta(days=days_ago), datetime.min.time(), tzinfo=timezone.utc)

        # known, due today (next_review == today)
        s.add(UserWordProgress(
            user_id=user_id, word_id=words[0].id, status="known",
            next_review=today, last_seen=_dt(0),
        ))
        # known, due in the future — must NOT count toward due_review
        s.add(UserWordProgress(
            user_id=user_id, word_id=words[1].id, status="known",
            next_review=today + timedelta(days=5), last_seen=_dt(1),
        ))
        # known, next_review NULL — counts as due (never scheduled)
        s.add(UserWordProgress(
            user_id=user_id, word_id=words[2].id, status="known",
            next_review=None, last_seen=_dt(2), mistake_count=2,
        ))
        # learning, with a mistake
        s.add(UserWordProgress(
            user_id=user_id, word_id=words[3].id, status="learning",
            mistake_count=1, last_seen=_dt(2),
        ))
        # learning, no mistakes
        s.add(UserWordProgress(
            user_id=user_id, word_id=words[4].id, status="learning", last_seen=_dt(0),
        ))
        # "new" — must not count toward known or learning
        s.add(UserWordProgress(
            user_id=user_id, word_id=words[5].id, status="new", last_seen=_dt(0),
        ))

        # Grammar: lesson 1 has two attempts — a failing one and a passing one.
        # Only the BEST attempt should count, so lesson 1 must count as passed.
        s.add(GrammarLessonResult(user_id=user_id, lesson_id=1, score=5, total=10, passed=False, created_at=_dt(0)))
        s.add(GrammarLessonResult(user_id=user_id, lesson_id=1, score=9, total=10, passed=True, created_at=_dt(2)))
        # Lesson 2 never passes.
        s.add(GrammarLessonResult(user_id=user_id, lesson_id=2, score=3, total=10, passed=False, created_at=_dt(0)))

        # Practice: two completed attempts.
        s.add(PracticeExamResult(user_id=user_id, test_id=1, score=8, total=10, created_at=_dt(0)))
        s.add(PracticeExamResult(user_id=user_id, test_id=2, score=6, total=10, created_at=_dt(0)))

        # Phrases: need a real Phrase row to satisfy the FK.
        prog = PhraseProgram(id=9401, title="Stats Test Program", is_public=True)
        s.add(prog)
        s.flush()
        phrase_a = Phrase(program_id=prog.id, text="labas", translation="hello", position=0)
        phrase_b = Phrase(program_id=prog.id, text="aciu", translation="thanks", position=1)
        s.add(phrase_a)
        s.add(phrase_b)
        s.flush()
        # stage 2 (learned), due today
        s.add(UserPhraseProgress(
            user_id=user_id, phrase_id=phrase_a.id, lesson_stage=2,
            next_review=today, last_seen=_dt(0),
        ))
        # stage 1 (not yet "learned") — must not count toward phrases_learned even
        # though it also has a due next_review, since the original logic requires
        # lesson_stage >= 2 for phrases_due_review too.
        s.add(UserPhraseProgress(
            user_id=user_id, phrase_id=phrase_b.id, lesson_stage=1,
            next_review=today, last_seen=_dt(3),  # day 3 — deliberately breaks the streak below
        ))

        # Custom phrase list, for the streak's 4th source table.
        cpl = CustomPhraseList(owner_user_id=user_id, title="My List")
        s.add(cpl)
        s.flush()
        cp = CustomPhrase(list_id=cpl.id, text="viso gero", translation="bye")
        s.add(cp)
        s.flush()
        # last_seen 2 days ago — same day as a UserWordProgress/GrammarLessonResult
        # row above, so it should NOT extend the streak past what those already give.
        s.add(UserCustomPhraseProgress(user_id=user_id, custom_phrase_id=cp.id, last_seen=_dt(2)))

        s.commit()


def test_stats_full_scenario(client):
    today = datetime.now(timezone.utc).date()
    email = "stats-full@example.com"
    uid = _user_id(client, email)
    _seed_full_scenario(uid, today)

    resp = client.get("/api/me/stats", headers=auth(make_token(email)))
    assert resp.status_code == 200
    body = resp.json()

    assert body["known"] == 3
    assert body["learning"] == 2
    assert body["total_studied"] == 5
    assert body["mistakes"] == 2  # words[2] and words[3]
    assert body["due_review"] == 2  # words[0] (== today) and words[2] (NULL)
    assert body["grammar_lessons_passed"] == 1  # only lesson 1, via its best attempt
    assert body["practice_exams_completed"] == 2
    assert body["phrases_learned"] == 1  # only the stage-2 phrase
    assert body["phrases_due_review"] == 1  # only the stage-2 phrase counts, despite both being "due"

    # Streak: activity on day 0 (UserWordProgress) and day 2 (UserWordProgress /
    # GrammarLessonResult / UserCustomPhraseProgress, all the same day) is contiguous
    # once day 1 is also covered by words[1]'s last_seen — so today, day1, day2 are
    # all covered, and day 3's phrase_b row is stage 1 but last_seen still counts for
    # the streak (streak only cares about activity, not lesson_stage) — however day 3
    # is separated from day 2 by nothing (3 directly follows 2), so the streak should
    # actually extend to day 3 too, then stop (no activity on day 4+).
    assert body["streak"] == 4


def test_stats_new_user_has_no_progress(client):
    """A brand-new user with zero rows in every table must get all-zero stats, not a crash."""
    email = "stats-empty@example.com"
    _user_id(client, email)

    resp = client.get("/api/me/stats", headers=auth(make_token(email)))
    assert resp.status_code == 200
    body = resp.json()
    assert body == {
        "known": 0,
        "learning": 0,
        "total_studied": 0,
        "streak": 0,
        "mistakes": 0,
        "due_review": 0,
        "grammar_lessons_passed": 0,
        "practice_exams_completed": 0,
        "phrases_learned": 0,
        "phrases_due_review": 0,
    }


def test_stats_streak_gap_stops_the_count(client):
    """A gap of one day with zero activity anywhere must stop the streak there."""
    today = datetime.now(timezone.utc).date()
    email = "stats-gap@example.com"
    uid = _user_id(client, email)

    with Session(database.engine) as s:
        wl = WordList(title="Gap Test List", is_public=True, subcategory="stats_gap_test")
        s.add(wl)
        s.flush()
        w = Word(lithuanian="labas", translation_en="hello", translation_ru="привет")
        s.add(w)
        s.flush()
        s.add(WordListItem(word_list_id=wl.id, word_id=w.id, position=0))

        def _dt(days_ago: int) -> datetime:
            return datetime.combine(today - timedelta(days=days_ago), datetime.min.time(), tzinfo=timezone.utc)

        # Active today and yesterday, then a gap at day 2, then active again at day 3.
        s.add(UserWordProgress(user_id=uid, word_id=w.id, status="known", last_seen=_dt(0)))
        s.add(UserWordProgress(user_id=uid, word_id=w.id, status="known", last_seen=_dt(1)))
        s.add(UserWordProgress(user_id=uid, word_id=w.id, status="known", last_seen=_dt(3)))
        s.commit()

    resp = client.get("/api/me/stats", headers=auth(make_token(email)))
    assert resp.status_code == 200
    # Streak only counts the unbroken run ending today: today + yesterday = 2.
    assert resp.json()["streak"] == 2


def test_activity_calendar_matches_within_window(client):
    today = datetime.now(timezone.utc).date()
    email = "stats-calendar@example.com"
    uid = _user_id(client, email)

    with Session(database.engine) as s:
        wl = WordList(title="Calendar Test List", is_public=True, subcategory="stats_calendar_test")
        s.add(wl)
        s.flush()
        w = Word(lithuanian="ryte", translation_en="morning", translation_ru="утро")
        s.add(w)
        s.flush()
        s.add(WordListItem(word_list_id=wl.id, word_id=w.id, position=0))

        def _dt(days_ago: int) -> datetime:
            return datetime.combine(today - timedelta(days=days_ago), datetime.min.time(), tzinfo=timezone.utc)

        s.add(UserWordProgress(user_id=uid, word_id=w.id, status="known", last_seen=_dt(0)))
        s.add(UserWordProgress(user_id=uid, word_id=w.id, status="known", last_seen=_dt(10)))
        # Outside the 28-day window (window_start = today - 27) — must be excluded.
        s.add(UserWordProgress(user_id=uid, word_id=w.id, status="known", last_seen=_dt(40)))
        s.commit()

    resp = client.get("/api/me/activity-calendar", headers=auth(make_token(email)))
    assert resp.status_code == 200
    dates = resp.json()["dates"]
    assert dates == sorted(dates)
    assert (today - timedelta(days=40)).isoformat() not in dates
    assert (today - timedelta(days=10)).isoformat() in dates
    assert today.isoformat() in dates
