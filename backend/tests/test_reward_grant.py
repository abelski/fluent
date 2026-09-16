"""Tests for the tiered, non-stacking leaderboard reward grant (#31).

Before #31 every top-3 winner got a flat 7 days, added on top of whatever they already
had. Because the top-3 set is near-stable week to week, the same few accounts banked
Premium indefinitely and never met the paywall: 48 grants had gone to 12 users, 4 of whom
took 36 of them, and none had ever paid. These tests pin the two properties that fixed
that — days follow rank, and a grant is a rolling window rather than a running total.
"""
from datetime import date, datetime, timedelta

import pytest
from sqlmodel import Session
from sqlalchemy.exc import IntegrityError

from conftest import _test_engine
from email_templates import generate_reward_email
from leaderboard_service import REWARD_DAYS, grant_reward_premium
from models import PreparedMessage, User

NOW = datetime(2026, 9, 16, 10, 0, 0)


def _user(**kw) -> User:
    return User(id=kw.pop("id", "u1"), email=kw.pop("email", "u@x.io"), name="U", **kw)


@pytest.mark.parametrize("rank,days", [(1, 7), (2, 4), (3, 2)])
def test_days_follow_rank(rank, days):
    u = _user()
    assert grant_reward_premium(u, rank, NOW) == days
    assert u.is_premium is True
    assert u.premium_until == NOW + timedelta(days=days)


@pytest.mark.parametrize("rank", [0, 4, 5, 99])
def test_unrewarded_rank_grants_nothing(rank):
    u = _user()
    assert grant_reward_premium(u, rank, NOW) == 0
    assert u.is_premium is False
    assert u.premium_until is None


def test_repeat_win_does_not_bank_premium():
    """The bug that motivated #31: a weekly grant must never accumulate.

    Winning 1st three weeks running leaves the user covered for 7 days from the *last*
    win, not 21 days from the first.
    """
    u = _user()
    grant_reward_premium(u, 1, NOW)
    grant_reward_premium(u, 1, NOW + timedelta(days=7))
    grant_reward_premium(u, 1, NOW + timedelta(days=14))
    assert u.premium_until == NOW + timedelta(days=21)  # = last win + 7, not 3 x 7 stacked


def test_win_mid_window_keeps_the_later_date():
    """A smaller prize never shortens coverage the user already has."""
    u = _user(is_premium=True, premium_until=NOW + timedelta(days=6))
    assert grant_reward_premium(u, 3, NOW) == 2       # 2-day prize
    assert u.premium_until == NOW + timedelta(days=6)  # but keeps the 6 days


def test_unlimited_grant_is_never_downgraded():
    """`premium_until IS NULL` with is_premium means an admin's unlimited grant.

    Writing a 7-day date there would take Premium *away*.
    """
    u = _user(is_premium=True, premium_until=None)
    assert grant_reward_premium(u, 1, NOW) == 0
    assert u.premium_until is None
    assert u.is_premium is True


@pytest.mark.parametrize("rank,days", sorted(REWARD_DAYS.items()))
def test_email_states_the_days_it_actually_grants(rank, days):
    """Guards the promise against the grant — the two read the same dict."""
    _s, ru = generate_reward_email("Ivan", rank, "ru")
    _s, en = generate_reward_email("Ivan", rank, "en")
    assert f"{days} " in ru and "1 неделю" not in ru
    assert f"{days} day" in en and "1 week" not in en


def test_same_user_and_week_cannot_be_inserted_twice():
    """The 2026-09-14 double-grant: two instances ran the job 0.6s apart and both
    inserted. The partial unique index is what makes that impossible."""
    week = date(2026, 9, 7)
    with Session(_test_engine) as s:
        u = _user(id="dup", email="dup@x.io")
        s.add(u)
        s.commit()
        for i in range(2):
            s.add(PreparedMessage(
                user_id="dup", user_email=u.email, user_name=u.name, user_lang="ru",
                subject="s", body="b", status="draft", message_type="reward",
                reward_rank=1, rewarded_week=week,
            ))
            if i == 0:
                s.commit()
            else:
                with pytest.raises(IntegrityError):
                    s.commit()
                s.rollback()


def test_reengagement_rows_are_unaffected_by_the_index():
    """Every reengagement message has rewarded_week NULL; many per user must stay legal."""
    with Session(_test_engine) as s:
        u = _user(id="re", email="re@x.io")
        s.add(u)
        s.commit()
        for i in range(3):
            s.add(PreparedMessage(
                user_id="re", user_email=u.email, user_name=u.name, user_lang="ru",
                subject=f"s{i}", body="b", status="draft", message_type="reengagement",
            ))
        s.commit()  # must not raise
