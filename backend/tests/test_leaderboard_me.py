"""Backend tests for GET /api/leaderboard's `me` field (#29 — always show my
own leaderboard score, even outside the top 10).

Covers: a user with zero progress sees `me.rank is None, me.score == 0`; a
user with some `UserWordProgress` sees a real `score` and a `rank` consistent
with their position among a couple of seeded competing users.
"""
from datetime import datetime

import pytest
from jose import jwt
from sqlmodel import Session, select

from conftest import _test_engine
from models import User, UserWordProgress

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"

_TEST_USER_IDS = ["lbme-zero", "lbme-mid", "lbme-low", "lbme-high"]


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _user(uid: str) -> User:
    return User(id=uid, email=f"{uid}@example.com", name=uid, email_consent=True)


def _progress(user_id: str, word_id: int, status: str) -> UserWordProgress:
    return UserWordProgress(user_id=user_id, word_id=word_id, status=status, last_seen=datetime(2026, 1, 5, 9, 0))


@pytest.fixture(autouse=True)
def _clean_leaderboard_me_data():
    """Isolate these tests' users/progress from the rest of the suite (same
    shared in-memory SQLite engine across all test modules — see conftest.py)."""
    def _wipe():
        with Session(_test_engine) as s:
            for uid in _TEST_USER_IDS:
                for prog in s.exec(select(UserWordProgress).where(UserWordProgress.user_id == uid)).all():
                    s.delete(prog)
                user = s.get(User, uid)
                if user:
                    s.delete(user)
            s.commit()
    _wipe()
    yield
    _wipe()


def test_me_zero_progress_has_no_rank(client):
    with Session(_test_engine) as s:
        s.add(_user("lbme-zero"))
        s.commit()

    r = client.get("/api/leaderboard", headers=auth(make_token("lbme-zero@example.com")))
    assert r.status_code == 200
    body = r.json()
    assert body["me"] == {"rank": None, "score": 0}


def test_me_with_progress_has_rank_consistent_with_position(client):
    with Session(_test_engine) as s:
        s.add(_user("lbme-mid"))
        s.add(_user("lbme-low"))
        s.add(_user("lbme-high"))
        s.flush()

        # High: 5 known words -> 15 pts (outranks mid).
        for wid in range(700, 705):
            s.add(_progress("lbme-high", wid, "known"))
        # Mid (the token holder below): 2 known words -> 6 pts.
        s.add(_progress("lbme-mid", 710, "known"))
        s.add(_progress("lbme-mid", 711, "known"))
        # Low: 1 learning word -> 1 pt (does not outrank mid).
        s.add(_progress("lbme-low", 720, "learning"))
        s.commit()

    high = client.get("/api/leaderboard", headers=auth(make_token("lbme-high@example.com"))).json()["me"]
    mid = client.get("/api/leaderboard", headers=auth(make_token("lbme-mid@example.com"))).json()["me"]
    low = client.get("/api/leaderboard", headers=auth(make_token("lbme-low@example.com"))).json()["me"]

    assert (high["score"], mid["score"], low["score"]) == (15, 6, 1)
    # Assert ordering, not exact rank numbers: the suite shares one session-scoped
    # SQLite DB (see conftest.py), so other tests' leftover users contribute
    # unknown-but-lower scores that shift absolute rank — a literal `rank == 2`
    # assertion is flaky depending on run/test order. Score-based ordering among
    # these three seeded users holds regardless of how many other users exist.
    assert high["rank"] < mid["rank"] < low["rank"]
