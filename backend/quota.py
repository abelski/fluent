# Shared daily-quota helpers.
# Used by both the vocabulary study endpoints (words.py) and grammar lessons (grammar.py).

from datetime import datetime, timezone

from fastapi import HTTPException
from sqlmodel import Session, select

from constants import DAILY_LIMIT
from models import DailyStudySession, User


def is_premium_active(user: User) -> bool:
    if not user.is_premium:
        return False
    if user.premium_until is None:
        return True
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    return user.premium_until > now_naive


def quota_check_and_increment(user: User, session: Session) -> None:
    """Enforce the daily session limit for basic users and record the session for all users."""
    premium = is_premium_active(user)
    today = datetime.now(timezone.utc).date()
    row = session.exec(
        select(DailyStudySession).where(
            DailyStudySession.user_id == user.id,
            DailyStudySession.study_date == today,
        ).with_for_update()
    ).first()
    if not row:
        row = DailyStudySession(user_id=user.id, study_date=today, session_count=0)
        session.add(row)
    if not premium and row.session_count >= DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={"code": "daily_limit_reached", "limit": DAILY_LIMIT, "sessions_today": row.session_count},
        )
    row.session_count += 1
    session.commit()
