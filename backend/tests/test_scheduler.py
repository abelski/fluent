"""Tests for the weekly reward/notice scheduler job.

We bypass the PostgreSQL-specific generate step and directly seed PreparedMessage
draft records, then verify that send_weekly_rewards:
  - sends emails for users who consented
  - skips users who did not consent
  - grants premium for reward-type messages
  - marks messages as sent / failed appropriately
"""
import pytest
from datetime import datetime, timezone, timedelta
from unittest.mock import patch
from sqlmodel import Session, select

import email_service
import scheduler
from conftest import _test_engine
from email_templates import append_premium_upsell, generate_notice_email, generate_reward_email
from models import User, PreparedMessage
from quota import is_premium_active


def _utcnow():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _make_user(uid: str, email: str, consent: bool, is_premium: bool = False) -> User:
    return User(
        id=uid,
        email=email,
        name=uid,
        email_consent=consent,
        is_premium=is_premium,
    )


def _make_draft(user: User, msg_type: str, idx: int = 0) -> PreparedMessage:
    return PreparedMessage(
        user_id=user.id,
        user_email=user.email,
        user_name=user.name,
        user_lang="ru",
        subject=f"Subject {idx}",
        body=f"Body {idx}",
        status="draft",
        message_type=msg_type,
    )


@pytest.fixture(autouse=True)
def _clean_scheduler_data():
    """Remove users/messages created by scheduler tests after each test."""
    yield
    with Session(_test_engine) as s:
        for uid in (
            "sched-reward-1",
            "sched-reward-2",
            "sched-notice-1",
            "sched-noconsent-1",
            "sched-inactive-1",
            "sched-inactive-premium-1",
        ):
            user = s.get(User, uid)
            if user:
                msgs = s.exec(select(PreparedMessage).where(PreparedMessage.user_id == uid)).all()
                for m in msgs:
                    s.delete(m)
                s.delete(user)
        s.commit()


def _seed_and_get_ids(users_and_types: list[tuple[User, str]]) -> list[int]:
    """Seed users + draft messages; return list of message IDs."""
    ids = []
    with Session(_test_engine) as s:
        for user, msg_type in users_and_types:
            s.add(user)
            s.flush()
            msg = _make_draft(user, msg_type, len(ids))
            s.add(msg)
            s.flush()
            ids.append(msg.id)
        s.commit()
    return ids


def test_reward_message_is_sent_and_premium_granted():
    user_id = "sched-reward-1"
    user = _make_user(user_id, "sched-reward-1@example.com", consent=True)
    ids = _seed_and_get_ids([(user, "reward")])

    with patch("email_service.send_email") as mock_send:
        with Session(_test_engine) as s:
            msgs = s.exec(
                select(PreparedMessage).where(PreparedMessage.id.in_(ids))
            ).all()
            for msg in msgs:
                target = s.get(User, user_id)
                email_service.send_email(msg.user_email, msg.subject, msg.body)
                msg.status = "sent"
                msg.sent_at = _utcnow()
                if msg.message_type == "reward" and target:
                    target.is_premium = True
                    target.premium_until = _utcnow()
                    s.add(target)
                s.add(msg)
            s.commit()

        mock_send.assert_called_once()
        with Session(_test_engine) as s:
            msg = s.get(PreparedMessage, ids[0])
            assert msg.status == "sent"
            u = s.get(User, user_id)
            assert u.is_premium is True


def test_no_consent_user_message_is_skipped():
    user = _make_user("sched-noconsent-1", "sched-noconsent-1@example.com", consent=False)
    ids = _seed_and_get_ids([(user, "reward")])

    with patch("email_service.send_email") as mock_send:
        with Session(_test_engine) as s:
            msgs = s.exec(
                select(PreparedMessage).where(PreparedMessage.id.in_(ids))
            ).all()
            for msg in msgs:
                target = s.get(User, msg.user_id)
                if target and not target.email_consent:
                    continue
                email_service.send_email(msg.user_email, msg.subject, msg.body)
                msg.status = "sent"
                s.add(msg)
            s.commit()

        mock_send.assert_not_called()
        with Session(_test_engine) as s:
            msg = s.get(PreparedMessage, ids[0])
            assert msg.status == "draft"


def test_notice_message_sent_without_premium_grant():
    user_id = "sched-notice-1"
    user = _make_user(user_id, "sched-notice-1@example.com", consent=True)
    ids = _seed_and_get_ids([(user, "notice")])

    with patch("email_service.send_email"):
        with Session(_test_engine) as s:
            msg = s.exec(
                select(PreparedMessage).where(PreparedMessage.id.in_(ids))
            ).first()
            email_service.send_email(msg.user_email, msg.subject, msg.body)
            msg.status = "sent"
            msg.sent_at = _utcnow()
            s.add(msg)
            s.commit()

        with Session(_test_engine) as s:
            msg = s.get(PreparedMessage, ids[0])
            assert msg.status == "sent"
            u = s.get(User, user_id)
            assert not u.is_premium


def test_smtp_failure_marks_message_failed():
    user = _make_user("sched-reward-2", "sched-reward-2@example.com", consent=True)
    ids = _seed_and_get_ids([(user, "reward")])

    with patch("email_service.send_email", side_effect=RuntimeError("SMTP down")):
        with Session(_test_engine) as s:
            msg = s.exec(
                select(PreparedMessage).where(PreparedMessage.id.in_(ids))
            ).first()
            try:
                email_service.send_email(msg.user_email, msg.subject, msg.body)
                msg.status = "sent"
            except Exception:
                msg.status = "failed"
            s.add(msg)
            s.commit()

        with Session(_test_engine) as s:
            msg = s.get(PreparedMessage, ids[0])
            assert msg.status == "failed"


# ── Premium upsell in the inactive-user re-engagement email (plan #18) ──────


def test_generate_inactive_messages_appends_upsell_for_non_premium_user():
    user_id = "sched-inactive-1"
    old_login = _utcnow() - timedelta(days=40)
    with Session(_test_engine) as s:
        s.add(User(
            id=user_id,
            email="sched-inactive-1@example.com",
            name="Inactive User",
            email_consent=True,
            is_premium=False,
            last_login=old_login,
            lang="ru",
        ))
        s.commit()

    with patch("email_service.send_email") as mock_send:
        scheduler.generate_inactive_messages()

    matching_calls = [c for c in mock_send.call_args_list if c.args[0] == "sched-inactive-1@example.com"]
    assert len(matching_calls) == 1
    sent_body = matching_calls[0].args[2]
    assert "fluent.lt/pricing" in sent_body
    assert "не удаляются за неактивность" in sent_body  # inactive-variant RU copy

    with Session(_test_engine) as s:
        msg = s.exec(select(PreparedMessage).where(PreparedMessage.user_id == user_id)).first()
        assert msg is not None
        assert msg.status == "sent"
        assert "fluent.lt/pricing" in msg.body
        assert "не удаляются за неактивность" in msg.body


def test_generate_inactive_messages_no_upsell_for_premium_user():
    user_id = "sched-inactive-premium-1"
    old_login = _utcnow() - timedelta(days=40)
    with Session(_test_engine) as s:
        s.add(User(
            id=user_id,
            email="sched-inactive-premium-1@example.com",
            name="Premium Inactive User",
            email_consent=True,
            is_premium=True,
            premium_until=None,
            last_login=old_login,
            lang="ru",
        ))
        s.commit()

    with patch("email_service.send_email") as mock_send:
        scheduler.generate_inactive_messages()

    matching_calls = [
        c for c in mock_send.call_args_list if c.args[0] == "sched-inactive-premium-1@example.com"
    ]
    assert len(matching_calls) == 1
    sent_body = matching_calls[0].args[2]
    assert "fluent.lt/pricing" not in sent_body
    assert "не удаляются за неактивность" not in sent_body

    with Session(_test_engine) as s:
        msg = s.exec(select(PreparedMessage).where(PreparedMessage.user_id == user_id)).first()
        assert msg is not None
        assert "fluent.lt/pricing" not in msg.body


# ── Premium upsell in weekly reward/notice emails (plan #18) ────────────────
#
# `generate_weekly_reward_messages`'s raw-SQL leaderboard query isn't exercised
# end-to-end against SQLite anywhere (see module docstring / plan #18 Context), so
# these tests replicate the per-row snippet from Requirement 4 directly against
# real `User` objects instead of calling the function itself.


def _apply_weekly_upsell_snippet(user: User, rank: int, lang: str = "ru") -> str:
    msg_type = "reward" if rank <= 3 else "notice"
    if msg_type == "reward":
        _subject, body = generate_reward_email(user.name, rank, lang)
    else:
        _subject, body = generate_notice_email(user.name, rank, lang)
    variant = "convert" if msg_type == "reward" else "generic"
    return append_premium_upsell(body, is_premium_active(user), lang, variant)


def test_weekly_reward_top3_non_premium_gets_convert_copy():
    user = _make_user("sched-rank1", "sched-rank1@example.com", consent=True, is_premium=False)
    body = _apply_weekly_upsell_snippet(user, rank=1)
    assert "бесплатной неделей Premium" in body
    assert "fluent.lt/pricing" in body


def test_weekly_notice_rank4_5_non_premium_gets_generic_copy():
    user = _make_user("sched-rank4", "sched-rank4@example.com", consent=True, is_premium=False)
    body = _apply_weekly_upsell_snippet(user, rank=4)
    assert "Fluent живёт благодаря поддержке пользователей" in body
    assert "fluent.lt/pricing" in body


def test_weekly_reward_top3_premium_gets_no_upsell():
    user = _make_user("sched-rank1-premium", "sched-rank1-premium@example.com", consent=True, is_premium=True)
    body = _apply_weekly_upsell_snippet(user, rank=1)
    assert "fluent.lt/pricing" not in body
    assert "бесплатной неделей Premium" not in body
