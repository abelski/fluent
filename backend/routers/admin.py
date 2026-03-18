# Admin-only endpoints for managing user tiers and premium access.
# All routes require is_admin=True on the authenticated user, otherwise 403.

from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select, func

from auth import require_user as _decode_user
from database import get_session
from models import User, DailyStudySession, WordList, SubcategoryMeta, Word, WordListItem
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
    all_keys = sorted({wl.subcategory for wl in lists if wl.subcategory})
    # Load existing metadata rows
    meta_rows = session.exec(select(SubcategoryMeta)).all()
    meta_map = {r.key: r for r in meta_rows}
    # Sort by sort_order (keys without a meta row sort last alphabetically)
    keys = sorted(
        all_keys,
        key=lambda k: (meta_map[k].sort_order or 0 if k in meta_map else 9999, k),
    )
    return [
        {
            "key": key,
            "cefr_level": meta_map[key].cefr_level if key in meta_map else None,
            "difficulty": meta_map[key].difficulty if key in meta_map else None,
            "article_url": meta_map[key].article_url if key in meta_map else None,
            "article_name_ru": meta_map[key].article_name_ru if key in meta_map else None,
            "article_name_en": meta_map[key].article_name_en if key in meta_map else None,
            "sort_order": meta_map[key].sort_order or 0 if key in meta_map else 0,
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


# ── Content management ──────────────────────────────────────────────────────


@router.get("/content/word-lists")
def get_content_word_lists(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all non-archived word lists ordered by subcategory sort_order then list sort_order."""
    _require_admin(authorization, session)
    lists = session.exec(
        select(WordList).where(WordList.archived == False)  # noqa: E712
    ).all()
    meta_rows = session.exec(select(SubcategoryMeta)).all()
    meta_map = {r.key: r for r in meta_rows}

    # Count words per list in one query
    counts = dict(
        session.exec(
            select(WordListItem.word_list_id, func.count(WordListItem.id))
            .group_by(WordListItem.word_list_id)
        ).all()
    )

    def _subcat_order(key: Optional[str]) -> int:
        if key and key in meta_map and meta_map[key].sort_order is not None:
            return meta_map[key].sort_order
        return 9999

    sorted_lists = sorted(
        lists,
        key=lambda wl: (_subcat_order(wl.subcategory), wl.sort_order or 0, wl.id or 0),
    )
    return [
        {
            "id": wl.id,
            "title": wl.title,
            "title_en": wl.title_en,
            "description": wl.description,
            "description_en": wl.description_en,
            "subcategory": wl.subcategory,
            "sort_order": wl.sort_order or 0,
            "word_count": counts.get(wl.id, 0),
        }
        for wl in sorted_lists
    ]


class WordListMetaUpdate(BaseModel):
    title_en: Optional[str] = None
    description_en: Optional[str] = None


@router.patch("/content/word-lists/{list_id}/meta")
def update_word_list_meta(
    list_id: int,
    body: WordListMetaUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update the English title and description for a word list."""
    _require_admin(authorization, session)
    wl = session.get(WordList, list_id)
    if not wl:
        raise HTTPException(status_code=404, detail="List not found")
    wl.title_en = body.title_en.strip() if body.title_en and body.title_en.strip() else None
    wl.description_en = body.description_en.strip() if body.description_en and body.description_en.strip() else None
    session.add(wl)
    session.commit()
    return {"ok": True}


class SubcategoryReorderItem(BaseModel):
    key: str
    sort_order: int


@router.patch("/content/subcategories/reorder")
def reorder_subcategories(
    body: List[SubcategoryReorderItem],
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update sort_order for multiple subcategories at once. Upserts SubcategoryMeta rows."""
    _require_admin(authorization, session)
    for item in body:
        row = session.exec(select(SubcategoryMeta).where(SubcategoryMeta.key == item.key)).first()
        if row is None:
            row = SubcategoryMeta(key=item.key)
            session.add(row)
        row.sort_order = item.sort_order
    session.commit()
    return {"ok": True}


class WordListReorderItem(BaseModel):
    id: int
    sort_order: int


@router.patch("/content/word-lists/reorder")
def reorder_word_lists(
    body: List[WordListReorderItem],
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update sort_order for multiple word lists at once."""
    _require_admin(authorization, session)
    for item in body:
        wl = session.get(WordList, item.id)
        if wl:
            wl.sort_order = item.sort_order
            session.add(wl)
    session.commit()
    return {"ok": True}


@router.get("/content/word-lists/{list_id}/words")
def get_list_words_admin(
    list_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all words in a list ordered by position, for admin editing."""
    _require_admin(authorization, session)
    wl = session.get(WordList, list_id)
    if not wl:
        raise HTTPException(status_code=404, detail="List not found")
    rows = session.exec(
        select(Word, WordListItem)
        .join(WordListItem, WordListItem.word_id == Word.id)
        .where(WordListItem.word_list_id == list_id)
        .where(Word.archived == False)  # noqa: E712
        .order_by(WordListItem.position)
    ).all()
    return [
        {
            "id": w.id,
            "lithuanian": w.lithuanian,
            "translation_en": w.translation_en,
            "translation_ru": w.translation_ru,
            "hint": w.hint,
            "position": wli.position,
            "item_id": wli.id,
        }
        for w, wli in rows
    ]


class WordUpdate(BaseModel):
    lithuanian: str
    translation_en: str
    translation_ru: str
    hint: Optional[str] = None


@router.patch("/content/words/{word_id}")
def update_word(
    word_id: int,
    body: WordUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Edit a word's content. Validates required fields server-side."""
    _require_admin(authorization, session)
    if not body.lithuanian.strip():
        raise HTTPException(status_code=400, detail="lithuanian is required")
    if not body.translation_ru.strip():
        raise HTTPException(status_code=400, detail="translation_ru is required")
    word = session.get(Word, word_id)
    if not word or word.archived:
        raise HTTPException(status_code=404, detail="Word not found")
    word.lithuanian = body.lithuanian.strip()
    word.translation_en = body.translation_en.strip()
    word.translation_ru = body.translation_ru.strip()
    word.hint = body.hint.strip() if body.hint and body.hint.strip() else None
    session.add(word)
    session.commit()
    return {"ok": True}


class WordPositionItem(BaseModel):
    item_id: int   # WordListItem.id
    position: int


@router.patch("/content/word-lists/{list_id}/words/reorder")
def reorder_words(
    list_id: int,
    body: List[WordPositionItem],
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update position for words in a list. item_id refers to WordListItem.id."""
    _require_admin(authorization, session)
    for item in body:
        wli = session.get(WordListItem, item.item_id)
        if wli and wli.word_list_id == list_id:
            wli.position = item.position
            session.add(wli)
    session.commit()
    return {"ok": True}
