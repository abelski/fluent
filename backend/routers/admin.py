# Admin-only endpoints for managing user tiers and premium access.
# All routes require is_admin=True on the authenticated user, otherwise 403.

import os
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import User, DailyStudySession

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"

DAILY_LIMIT = 10


def _require_admin(authorization: Optional[str], session: Session) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload["email"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _is_premium_active(user: User) -> bool:
    if not user.is_premium:
        return False
    if user.premium_until is None:
        return True
    return user.premium_until > datetime.now(timezone.utc).replace(tzinfo=None)


@router.get("/users")
def list_users(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all users with their tier and today's session count."""
    _require_admin(authorization, session)

    today = datetime.now(timezone.utc).date()
    users = session.exec(select(User)).all()

    session_rows = session.exec(
        select(DailyStudySession).where(DailyStudySession.study_date == today)
    ).all()
    counts = {r.user_id: r.session_count for r in session_rows}

    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "is_premium": u.is_premium,
            "premium_until": u.premium_until,
            "premium_active": _is_premium_active(u),
            "is_admin": u.is_admin,
            "sessions_today": counts.get(u.id, 0),
            "daily_limit": None if _is_premium_active(u) else DAILY_LIMIT,
        }
        for u in users
    ]


class PremiumUpdate(BaseModel):
    is_premium: bool
    premium_until: Optional[datetime] = None  # None = no expiry


@router.patch("/users/{user_id}/premium")
def set_premium(
    user_id: str,
    body: PremiumUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Grant or revoke premium for a user. premium_until=None means unlimited."""
    _require_admin(authorization, session)

    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.is_premium and body.premium_until is not None:
        if body.premium_until <= datetime.now(timezone.utc).replace(tzinfo=None):
            raise HTTPException(status_code=400, detail="premium_until must be in the future")

    target.is_premium = body.is_premium
    target.premium_until = body.premium_until
    session.add(target)
    session.commit()
    return {"ok": True}
