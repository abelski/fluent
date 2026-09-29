"""#56 — GET /api/me/effort: leaderboard points per source, this week vs all time."""
from datetime import datetime, timedelta

import pytest
from jose import jwt
from sqlmodel import Session, select

from conftest import _test_engine
from leaderboard_service import current_week_bounds
from models import GrammarLessonResult, PracticeExamResult, User, UserPhraseProgress, UserWordProgress

_UID = "effort56-user"


def _auth() -> dict:
    token = jwt.encode({"email": f"{_UID}@example.com", "name": "x", "picture": None},
                       "fluent-local-secret-change-in-prod", algorithm="HS256")
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def _user():
    """Shared SQLite engine without FK enforcement — wipe every row this user owns."""
    def _wipe():
        with Session(_test_engine) as s:
            for model in (UserWordProgress, UserPhraseProgress, GrammarLessonResult, PracticeExamResult):
                for row in s.exec(select(model).where(model.user_id == _UID)).all():
                    s.delete(row)
            if (u := s.get(User, _UID)):
                s.delete(u)
            s.commit()
    _wipe()
    with Session(_test_engine) as s:
        s.add(User(id=_UID, email=f"{_UID}@example.com", name="effort"))
        s.commit()
    yield
    _wipe()


def _now() -> datetime:
    return datetime.utcnow()


def _before_week() -> datetime:
    return current_week_bounds()[0] - timedelta(days=1)


def _add(*rows) -> None:
    with Session(_test_engine) as s:
        for r in rows:
            s.add(r)
        s.commit()


def _words(when, known=0, learning=0, start=9100):
    return [UserWordProgress(user_id=_UID, word_id=start + i, status="known" if i < known else "learning", last_seen=when)
            for i in range(known + learning)]


def _phrases(when, stages, start=9100):
    return [UserPhraseProgress(user_id=_UID, phrase_id=start + i, lesson_stage=st, last_seen=when)
            for i, st in enumerate(stages)]


def _grammar(when, passed: bool, lesson_id=9100):
    return GrammarLessonResult(user_id=_UID, lesson_id=lesson_id, score=5 if passed else 1, total=5,
                               passed=passed, created_at=when)


def test_anonymous_401(client):
    assert client.get("/api/me/effort").status_code == 401


def test_zero_progress_all_zeros(client):
    r = client.get("/api/me/effort", headers=_auth())
    assert r.status_code == 200
    zero = {"words": 0, "phrases": 0, "grammar": 0}
    assert r.json() == {"week": zero, "all": zero}


def test_points_per_source_this_week(client):
    now = _now()
    _add(*_words(now, known=3, learning=1),              # 3*3 + 1 = 10
         *_phrases(now, [2, 2, 3, 1, 0]),                  # 3*3 + 1, stage 0 not counted = 10
         _grammar(now, True), _grammar(now, False, 9101))  # 5 + 0
    body = client.get("/api/me/effort", headers=_auth()).json()
    assert body["week"] == {"words": 10, "phrases": 10, "grammar": 5}
    assert body["all"] == body["week"]


def test_practice_result_changes_nothing(client):
    _add(*_words(_now(), known=1))
    before = client.get("/api/me/effort", headers=_auth()).json()
    _add(PracticeExamResult(user_id=_UID, test_id=1, score=9, total=10, created_at=_now()))
    assert client.get("/api/me/effort", headers=_auth()).json() == before


def test_before_week_rows_count_in_all_only(client):
    old = _before_week()
    _add(*_words(old, known=2, start=9200), *_phrases(old, [2], start=9200), _grammar(old, True, 9200),
         *_words(_now(), learning=1))
    body = client.get("/api/me/effort", headers=_auth()).json()
    assert body["week"] == {"words": 1, "phrases": 0, "grammar": 0}
    assert body["all"] == {"words": 7, "phrases": 3, "grammar": 5}


def test_sums_match_leaderboard_scores(client):
    old = _before_week()
    _add(*_words(old, known=2, start=9200), *_words(_now(), known=1, learning=2),
         *_phrases(_now(), [1, 2]), _grammar(old, True, 9200), _grammar(_now(), True))
    body = client.get("/api/me/effort", headers=_auth()).json()
    for period in ("week", "all"):
        me = client.get(f"/api/leaderboard?period={period}", headers=_auth()).json()["me"]
        assert sum(body[period].values()) == me["score"], period


def test_not_cached(client):
    first = client.get("/api/me/effort", headers=_auth()).json()
    _add(*_words(_now(), known=1))
    second = client.get("/api/me/effort", headers=_auth()).json()
    assert first["all"]["words"] == 0 and second["all"]["words"] == 3
