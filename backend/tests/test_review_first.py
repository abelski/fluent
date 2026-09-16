"""Tests for review-first (#31).

When a list holds more due words than fit in one session, the study page offers a screen
with two buttons before the session starts. The rejected alternative was blocking new
words behind a paywall whenever >20% of a user's words were overdue — that fired for 60 of
67 active users and would have walled the product. What these tests pin:

  * the offer is driven by a **count**, not a percentage of the user's words;
  * asking for the count never costs a daily session, so offering the choice is free;
  * "learn new" really does learn new — there is no silent clamp behind the button.
"""
from datetime import date, timedelta

import pytest
from sqlmodel import Session, select

import database as _db
from models import User, UserWordProgress, Word, WordList, WordListItem
from routers.words import DEFAULT_NEW_RATIO, session_new_ratio
from tests.test_review_flow import auth, make_token

LIST_ID = 9310
YESTERDAY = date.today() - timedelta(days=1)


def _user(ratio=None) -> User:
    return User(id="u", email="u@x.io", name="U", new_words_ratio=ratio)


# ── The rule ────────────────────────────────────────────────────────────────

def test_review_mode_drops_new_words_entirely():
    assert session_new_ratio(_user(), "review") == 0.0


def test_no_mode_keeps_the_users_own_mix():
    assert session_new_ratio(_user(), None) == DEFAULT_NEW_RATIO
    assert session_new_ratio(_user(ratio=0.4), None) == 0.4


# ── Endpoint wiring ─────────────────────────────────────────────────────────

def _seed(email: str, due: int, fresh: int):
    """A list holding `due` known-but-overdue words plus `fresh` never-seen ones."""
    with Session(_db.engine) as s:
        if s.get(WordList, LIST_ID) is None:
            s.add(WordList(id=LIST_ID, title="Review-first", is_public=True, subcategory="test_program"))
        for i in range(due + fresh):
            wid = LIST_ID * 10 + i
            if s.get(Word, wid) is None:
                s.add(Word(id=wid, lithuanian=f"lt{wid}", translation_ru=f"ру{wid}", translation_en=f"en{wid}"))
                s.add(WordListItem(id=wid, word_list_id=LIST_ID, word_id=wid, position=i))
        s.commit()
        user = s.exec(select(User).where(User.email == email)).first()
        for i in range(due):
            wid = LIST_ID * 10 + i
            if not s.exec(select(UserWordProgress).where(
                    UserWordProgress.user_id == user.id, UserWordProgress.word_id == wid)).first():
                s.add(UserWordProgress(user_id=user.id, word_id=wid, status="known",
                                       sm2_reps=2, interval=1, next_review=YESTERDAY))
        s.commit()


def _setup(client, email: str, due: int, fresh: int, size: int = 10):
    headers = auth(make_token(email))
    client.get("/api/me/quota", headers=headers)  # creates the user row
    _seed(email, due=due, fresh=fresh)
    assert client.patch("/api/me/settings",
                        json={"words_per_session": size, "new_words_ratio": 0.7},
                        headers=headers).status_code == 200
    return headers


def _sessions_today(client, headers) -> int:
    return client.get("/api/me/quota", headers=headers).json()["sessions_today"]


def test_progress_reports_the_backlog_and_the_session_size(client):
    headers = _setup(client, "rf-progress@x.io", due=14, fresh=10)
    p = client.get(f"/api/lists/{LIST_ID}/progress", headers=headers).json()
    assert p["due"] == 14
    assert p["session_size"] == 10


def test_asking_for_the_backlog_costs_no_daily_session(client):
    """The offer screen reads /progress precisely so that showing it is free."""
    headers = _setup(client, "rf-free@x.io", due=14, fresh=10)
    before = _sessions_today(client, headers)
    client.get(f"/api/lists/{LIST_ID}/progress", headers=headers)
    client.get(f"/api/lists/{LIST_ID}/progress", headers=headers)
    assert _sessions_today(client, headers) == before


def test_review_mode_serves_a_review_only_session(client):
    headers = _setup(client, "rf-review@x.io", due=14, fresh=10)
    data = client.get(f"/api/lists/{LIST_ID}/study?star_level=3&mode=review", headers=headers).json()
    assert [w for w in data["words"] if w["status"] == "new"] == []
    assert len(data["words"]) == 10


def test_learn_new_really_learns_new(client):
    """No silent clamp behind the second button — it must behave as if the screen never
    appeared, or the label is a lie."""
    headers = _setup(client, "rf-new@x.io", due=14, fresh=10)
    data = client.get(f"/api/lists/{LIST_ID}/study?star_level=3", headers=headers).json()
    assert len(([w for w in data["words"] if w["status"] == "new"])) == 7  # the user's own 0.7


def test_study_still_reports_the_backlog_for_the_reminder_strip(client):
    headers = _setup(client, "rf-strip@x.io", due=14, fresh=10)
    data = client.get(f"/api/lists/{LIST_ID}/study?star_level=3", headers=headers).json()
    assert data["review_first"] == {"due": 14}


def test_nothing_is_offered_when_the_backlog_fits(client):
    headers = _setup(client, "rf-small@x.io", due=3, fresh=10)
    p = client.get(f"/api/lists/{LIST_ID}/progress", headers=headers).json()
    assert p["due"] <= p["session_size"]
    data = client.get(f"/api/lists/{LIST_ID}/study?star_level=3", headers=headers).json()
    assert data["review_first"] is None


@pytest.mark.parametrize("size,due,offered", [(10, 4, False), (10, 200, True), (40, 14, False)])
def test_the_trigger_is_a_count_not_a_percentage(client, size, due, offered):
    """4 due of 20 and 200 due of 1000 are both exactly 20% overdue — the rejected
    threshold. Only the one that outgrows a session should be offered."""
    headers = _setup(client, f"rf-count-{size}-{due}@x.io", due=due, fresh=10, size=size)
    p = client.get(f"/api/lists/{LIST_ID}/progress", headers=headers).json()
    assert (p["due"] > p["session_size"]) is offered
