"""Regression tests for issue #157 — weekly reward job counted the wrong week.

Covers:
  1. Pure unit tests of `previous_week_bounds` (no DB).
  2. Integration test of `generate_weekly_reward_messages`: a decoy user whose
     activity falls inside the *run* week (Monday morning, after the reward
     window closed) must never be rewarded — this reproduces the exact
     reported symptom ("counting was done on zeroed-out data").
  3. Dedup anchored to the rewarded week, not a rolling 6-day window.
  4. Endpoint parity — POST /api/admin/leaderboard-rewards/generate (superadmin)
     must yield the same recipients/ranking the helper itself would compute.
"""
from datetime import datetime
from unittest.mock import patch

import pytest
from jose import jwt
from sqlmodel import Session, select

from conftest import _test_engine
from models import User, UserWordProgress, PreparedMessage
from scheduler import previous_week_bounds, generate_weekly_reward_messages

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


SUPERADMIN_TOKEN = make_token("artyrbelski@gmail.com", name="Artur")

# The reward job runs Monday 10:00 UTC. Bug: PostgreSQL's DATE_TRUNC('week', NOW())
# anchors to *this* Monday, so the reward window used to be [Mon 00:00, Mon 10:00) of
# the week that just started, instead of the 7 full days that just ended.
RUN_NOW = datetime(2026, 8, 17, 10, 0)          # Monday, job run time
PREV_WEEK_START = datetime(2026, 8, 10, 0, 0)   # Monday of the completed week
PREV_WEEK_END = datetime(2026, 8, 17, 0, 0)     # Monday that closed it (== RUN_NOW's day-start)


# ── 1. Pure unit tests for previous_week_bounds ──────────────────────────────

def test_previous_week_bounds_monday_morning():
    assert previous_week_bounds(datetime(2026, 8, 17, 10, 0)) == (
        datetime(2026, 8, 10, 0, 0),
        datetime(2026, 8, 17, 0, 0),
    )


def test_previous_week_bounds_sunday_late_night():
    # Sunday 23:59 belongs to the week [Aug 10, Aug 17) — the previous completed
    # week is therefore [Aug 3, Aug 10).
    assert previous_week_bounds(datetime(2026, 8, 16, 23, 59)) == (
        datetime(2026, 8, 3, 0, 0),
        datetime(2026, 8, 10, 0, 0),
    )


def test_previous_week_bounds_midweek_wednesday():
    assert previous_week_bounds(datetime(2026, 8, 19, 15, 30)) == (
        datetime(2026, 8, 10, 0, 0),
        datetime(2026, 8, 17, 0, 0),
    )


def test_previous_week_bounds_monday_midnight_exactly():
    """At exactly Monday 00:00:00 `today_start == this_week_start`; the function
    must still return the *fully preceding* 7-day week, not a zero-length window."""
    start, end = previous_week_bounds(datetime(2026, 8, 17, 0, 0, 0))
    assert start == datetime(2026, 8, 10, 0, 0)
    assert end == datetime(2026, 8, 17, 0, 0)
    assert (end - start).days == 7


# ── Shared fixtures/helpers for the integration tests below ─────────────────

_TEST_USER_IDS = [
    "i157-leader-a", "i157-leader-b", "i157-leader-c",
    "i157-decoy", "i157-dedup-noskip", "i157-dedup-skip",
    "i157-parity-x", "i157-parity-y",
]


@pytest.fixture(autouse=True)
def _clean_issue_157_data():
    """Remove users/messages/progress created by these tests, before and after,
    so runs are isolated from each other and from other test modules."""
    def _wipe():
        with Session(_test_engine) as s:
            for uid in _TEST_USER_IDS:
                for prog in s.exec(select(UserWordProgress).where(UserWordProgress.user_id == uid)).all():
                    s.delete(prog)
                for msg in s.exec(select(PreparedMessage).where(PreparedMessage.user_id == uid)).all():
                    s.delete(msg)
                user = s.get(User, uid)
                if user:
                    s.delete(user)
            s.commit()
    _wipe()
    yield
    _wipe()


def _user(uid: str, score_hint: str = "", lang: str = "ru") -> User:
    return User(id=uid, email=f"{uid}@example.com", name=uid, lang=lang, email_consent=True)


def _progress(user_id: str, word_id: int, status: str, last_seen: datetime) -> UserWordProgress:
    return UserWordProgress(user_id=user_id, word_id=word_id, status=status, last_seen=last_seen)


def _rewarded_user_ids(new_ids: list[int]) -> list[str]:
    with Session(_test_engine) as s:
        msgs = s.exec(select(PreparedMessage).where(PreparedMessage.id.in_(new_ids))).all()
        by_id = {m.id: m for m in msgs}
        return [by_id[i].user_id for i in new_ids]


# ── 2. Integration test — decoy from the run week must be excluded ──────────

def test_decoy_with_run_week_activity_is_excluded_and_leaders_ranked_correctly():
    with Session(_test_engine) as s:
        s.add(_user("i157-leader-a"))
        s.add(_user("i157-leader-b"))
        s.add(_user("i157-leader-c"))
        s.add(_user("i157-decoy"))
        s.flush()

        # Leader A: 5 known words in the previous week -> 15 pts (rank 1).
        for wid in range(1, 6):
            s.add(_progress("i157-leader-a", wid, "known", datetime(2026, 8, 12, 10, 0)))
        # Leader B: 3 known words -> 9 pts (rank 2).
        for wid in range(10, 13):
            s.add(_progress("i157-leader-b", wid, "known", datetime(2026, 8, 13, 10, 0)))
        # Leader C: 1 known + 1 learning -> 4 pts (rank 3).
        s.add(_progress("i157-leader-c", 20, "known", datetime(2026, 8, 14, 10, 0)))
        s.add(_progress("i157-leader-c", 21, "learning", datetime(2026, 8, 14, 11, 0)))

        # Decoy: huge score, but all activity happened Monday morning of the
        # *run* week (after the previous week already closed at Aug 17 00:00).
        # This is exactly the reported bug: without the fix this decoy would
        # win because DATE_TRUNC('week', NOW()) matched their timestamps.
        for wid in range(100, 150):
            s.add(_progress("i157-decoy", wid, "known", datetime(2026, 8, 17, 9, 0)))

        s.commit()

    with patch("scheduler._utcnow", return_value=RUN_NOW):
        with Session(_test_engine) as s:
            new_ids = generate_weekly_reward_messages(s)

    recipients = _rewarded_user_ids(new_ids)
    assert "i157-decoy" not in recipients
    assert recipients == ["i157-leader-a", "i157-leader-b", "i157-leader-c"]

    with Session(_test_engine) as s:
        msgs = s.exec(select(PreparedMessage).where(PreparedMessage.id.in_(new_ids))).all()
        types = {m.user_id: m.message_type for m in msgs}
        assert types["i157-leader-a"] == "reward"
        assert types["i157-leader-b"] == "reward"
        assert types["i157-leader-c"] == "reward"


# ── 3. Dedup anchored to the rewarded week ───────────────────────────────────

def test_dedup_ignores_previous_week_message_but_honors_run_week_message():
    with Session(_test_engine) as s:
        s.add(_user("i157-dedup-noskip"))
        s.add(_user("i157-dedup-skip"))
        s.flush()

        # Both are leaders for the previous completed week.
        s.add(_progress("i157-dedup-noskip", 200, "known", datetime(2026, 8, 12, 9, 0)))
        s.add(_progress("i157-dedup-skip", 201, "known", datetime(2026, 8, 13, 9, 0)))

        # An existing reward message created Wednesday of the *previous* week
        # (before week_end) must NOT suppress generation for this user.
        s.add(PreparedMessage(
            user_id="i157-dedup-noskip", user_email="x@example.com", user_name="x",
            user_lang="ru", subject="s", body="b", status="sent", message_type="reward",
            created_at=datetime(2026, 8, 12, 8, 0),
        ))
        # An existing reward message created Monday 00:30 of the *run* week
        # (>= week_end) MUST suppress regeneration — this is the re-run
        # idempotency guarantee.
        s.add(PreparedMessage(
            user_id="i157-dedup-skip", user_email="y@example.com", user_name="y",
            user_lang="ru", subject="s", body="b", status="sent", message_type="reward",
            created_at=datetime(2026, 8, 17, 0, 30),
        ))
        s.commit()

    with patch("scheduler._utcnow", return_value=RUN_NOW):
        with Session(_test_engine) as s:
            new_ids = generate_weekly_reward_messages(s)

    recipients = _rewarded_user_ids(new_ids)
    assert "i157-dedup-noskip" in recipients
    assert "i157-dedup-skip" not in recipients


# ── 4. Endpoint parity — manual admin path must match the helper ────────────

def test_generate_endpoint_matches_helper_recipients_and_ranking(client):
    with Session(_test_engine) as s:
        s.add(_user("i157-parity-x"))
        s.add(_user("i157-parity-y"))
        s.flush()
        # X outranks Y.
        for wid in range(300, 304):
            s.add(_progress("i157-parity-x", wid, "known", datetime(2026, 8, 11, 9, 0)))
        s.add(_progress("i157-parity-y", 305, "known", datetime(2026, 8, 11, 9, 0)))
        s.commit()

    with patch("scheduler._utcnow", return_value=RUN_NOW):
        r = client.post("/api/admin/leaderboard-rewards/generate", headers=auth(SUPERADMIN_TOKEN))
    assert r.status_code == 200
    body = r.json()
    assert body["ok"] is True
    assert body["created"] == 2

    with Session(_test_engine) as s:
        msgs = s.exec(
            select(PreparedMessage)
            .where(PreparedMessage.user_id.in_(["i157-parity-x", "i157-parity-y"]))
            .order_by(PreparedMessage.id)
        ).all()
        # Same recipients, same rank order the helper itself would have produced
        # for this data (X has more points than Y).
        assert [m.user_id for m in msgs] == ["i157-parity-x", "i157-parity-y"]
        assert all(m.message_type == "reward" for m in msgs)

    # Idempotent: calling again for the same rewarded week creates nothing new,
    # proving the endpoint is anchored to the same week the helper used above.
    with patch("scheduler._utcnow", return_value=RUN_NOW):
        r2 = client.post("/api/admin/leaderboard-rewards/generate", headers=auth(SUPERADMIN_TOKEN))
    assert r2.status_code == 200
    assert r2.json()["created"] == 0
