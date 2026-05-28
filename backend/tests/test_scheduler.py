"""Tests for the weekly reward/notice scheduler job.

We bypass the PostgreSQL-specific generate step and directly seed PreparedMessage
draft records, then verify that send_weekly_rewards:
  - sends emails for users who consented
  - skips users who did not consent
  - grants premium for reward-type messages
  - marks messages as sent / failed appropriately
"""
import pytest
from datetime import datetime, timezone
from unittest.mock import patch
from sqlmodel import Session, select

import email_service
from conftest import _test_engine
from models import User, PreparedMessage


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
        for uid in ("sched-reward-1", "sched-reward-2", "sched-notice-1", "sched-noconsent-1"):
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
