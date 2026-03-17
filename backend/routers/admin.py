# Admin-only endpoints for managing user tiers and premium access.
# All routes require is_admin=True on the authenticated user, otherwise 403.

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from auth import require_user as _decode_user
from database import get_session
from models import User, DailyStudySession, WordList, SubcategoryMeta
from constants import DAILY_LIMIT

router = APIRouter()


def _require_admin(authorization: Optional[str], session: Session) -> User:
    user = _decode_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _require_superadmin(authorization: Optional[str], session: Session) -> User:
    user = _decode_user(authorization, session)
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _is_premium_active(user: User) -> bool:
    if not user.is_premium:
        return False
    if user.premium_until is None:
        return True
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    return user.premium_until > now_naive


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
            "is_superadmin": u.is_superadmin,
            "sessions_today": counts.get(u.id, 0),
            "daily_limit": None if _is_premium_active(u) else DAILY_LIMIT,
        }
        for u in users
    ]


class AdminUpdate(BaseModel):
    is_admin: bool


@router.patch("/users/{user_id}/set-admin")
def set_admin(
    user_id: str,
    body: AdminUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Grant or revoke admin role. Superadmin-only."""
    _require_superadmin(authorization, session)
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.is_superadmin:
        raise HTTPException(status_code=400, detail="Cannot change superadmin role")
    target.is_admin = body.is_admin
    session.add(target)
    session.commit()
    return {"ok": True}


@router.get("/subcategories")
def list_subcategories(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all subcategories (derived from word lists) with their metadata."""
    _require_admin(authorization, session)
    # Collect all distinct subcategory keys from word lists
    lists = session.exec(select(WordList).where(WordList.archived == False)).all()  # noqa: E712
    keys = sorted({wl.subcategory for wl in lists if wl.subcategory})
    # Load existing metadata rows
    meta_rows = session.exec(select(SubcategoryMeta)).all()
    meta_map = {r.key: r for r in meta_rows}
    return [
        {
            "key": key,
            "cefr_level": meta_map[key].cefr_level if key in meta_map else None,
            "difficulty": meta_map[key].difficulty if key in meta_map else None,
            "article_url": meta_map[key].article_url if key in meta_map else None,
            "article_name_ru": meta_map[key].article_name_ru if key in meta_map else None,
            "article_name_en": meta_map[key].article_name_en if key in meta_map else None,
        }
        for key in keys
    ]


class SubcategoryMetaUpdate(BaseModel):
    cefr_level: Optional[str] = None
    difficulty: Optional[str] = None
    article_url: Optional[str] = None
    article_name_ru: Optional[str] = None
    article_name_en: Optional[str] = None


@router.patch("/subcategories/{key}")
def update_subcategory_meta(
    key: str,
    body: SubcategoryMetaUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Upsert CEFR level, difficulty, and article URL for a subcategory."""
    _require_admin(authorization, session)
    row = session.exec(select(SubcategoryMeta).where(SubcategoryMeta.key == key)).first()
    if row is None:
        row = SubcategoryMeta(key=key)
        session.add(row)
    row.cefr_level = body.cefr_level
    row.difficulty = body.difficulty
    row.article_url = body.article_url
    row.article_name_ru = body.article_name_ru
    row.article_name_en = body.article_name_en
    session.commit()
    return {"ok": True}


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
        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        if body.premium_until <= now_naive:
            raise HTTPException(status_code=400, detail="premium_until must be in the future")

    target.is_premium = body.is_premium
    target.premium_until = body.premium_until
    session.add(target)
    session.commit()
    return {"ok": True}
