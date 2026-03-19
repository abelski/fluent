# Word lists and vocabulary study endpoints.
# Handles browsing lists, fetching study sessions, and recording per-word progress.

import random
from datetime import datetime, timedelta, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select, col, func

from database import get_session
from models import User, Word, WordList, WordListItem, UserWordProgress, DailyStudySession, SubcategoryMeta
from constants import DAILY_LIMIT
from auth import require_user as _require_user, try_get_user as _try_get_user

router = APIRouter()


def _list_words(list_id: int, session: Session) -> list[dict]:
    """Fetch all active (non-archived) words in a list ordered by their position."""
    rows = session.exec(
        select(Word)
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
        }
        for w in rows
    ]


@router.get("/subcategory-meta")
def get_subcategory_meta(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return CEFR/difficulty/article metadata keyed by subcategory string.
    Admins receive is_published field for all subcategories."""
    user = _try_get_user(authorization, session)
    is_admin = user is not None and user.is_admin
    rows = session.exec(select(SubcategoryMeta)).all()
    return {
        r.key: {
            "cefr_level": r.cefr_level,
            "difficulty": r.difficulty,
            "article_url": r.article_url,
            "article_name_ru": r.article_name_ru,
            "article_name_en": r.article_name_en,
            "name_ru": r.name_ru,
            "name_en": r.name_en,
            **({"is_published": r.is_published} if is_admin else {}),
        }
        for r in rows
    }


@router.get("/lists")
def get_lists(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all public word lists ordered by subcategory sort_order then list sort_order.
    Non-admins only see lists from published subcategories.
    Word counts are fetched in a single aggregation query to avoid N+1."""
    user = _try_get_user(authorization, session)
    is_admin = user is not None and user.is_admin

    lists = session.exec(
        select(WordList).where(WordList.is_public == True, WordList.archived == False)  # noqa: E712
    ).all()
    # Single aggregation query to get word counts for all lists at once
    counts = dict(
        session.exec(
            select(WordListItem.word_list_id, func.count(WordListItem.id))
            .group_by(WordListItem.word_list_id)
        ).all()
    )
    # Load subcategory metadata for ordering and publication filtering
    meta_rows = session.exec(select(SubcategoryMeta)).all()
    subcat_order = {r.key: (r.sort_order or 0) for r in meta_rows}
    published_subcats = {r.key for r in meta_rows if r.is_published}

    # Filter unpublished subcategories for non-admins
    if not is_admin:
        lists = [wl for wl in lists if (wl.subcategory or "") in published_subcats]

    sorted_lists = sorted(
        lists,
        key=lambda wl: (subcat_order.get(wl.subcategory or "", 9999), wl.sort_order or 0, wl.id or 0),
    )
    return [
        {
            "id": wl.id,
            "title": wl.title,
            "title_en": wl.title_en,
            "description": wl.description,
            "description_en": wl.description_en,
            "subcategory": wl.subcategory,
            "word_count": counts.get(wl.id, 0),
        }
        for wl in sorted_lists
    ]


@router.get("/lists/{list_id}")
def get_list(list_id: int, session: Session = Depends(get_session)):
    """Return a single list with all its words. Used on the list detail page."""
    wl = session.get(WordList, list_id)
    if not wl or wl.archived:
        raise HTTPException(status_code=404, detail="List not found")
    return {
        "id": wl.id,
        "title": wl.title,
        "title_en": wl.title_en,
        "description": wl.description,
        "description_en": wl.description_en,
        "words": _list_words(list_id, session),
    }


# Number of words returned per study session.
QUIZ_SIZE = 10


def _is_premium_active(user: User) -> bool:
    if not user.is_premium:
        return False
    if user.premium_until is None:
        return True
    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    return user.premium_until > now_naive


@router.get("/lists/{list_id}/study")
def get_study_words(
    list_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a prioritized set of words for a study session.

    For authenticated users, words are sorted by learning status so that
    new and in-progress words appear before already-known words.
    Within each status group the order is randomized.

    For anonymous users all words are shuffled randomly.
    Either way at most QUIZ_SIZE words are returned.
    """
    wl = session.get(WordList, list_id)
    if not wl or wl.archived:
        raise HTTPException(status_code=404, detail="List not found")

    all_words = _list_words(list_id, session)

    # Try to get authenticated user for progress-based prioritization.
    # Auth is optional here — unauthenticated users still get a study session.
    user = _try_get_user(authorization, session)

    if user and not _is_premium_active(user):
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
            if row.session_count >= DAILY_LIMIT:
                raise HTTPException(
                    status_code=429,
                    detail={"code": "daily_limit_reached", "limit": DAILY_LIMIT, "sessions_today": row.session_count},
                )
            row.session_count += 1
            session.commit()

    if user and all_words:
        word_ids = [w["id"] for w in all_words]
        progress_records = session.exec(
            select(UserWordProgress).where(
                UserWordProgress.user_id == user.id,
                col(UserWordProgress.word_id).in_(word_ids),
            )
        ).all()
        progress_map = {p.word_id: p.status for p in progress_records}

        # Annotate words with their status for the frontend so it can show
        # a coloured badge (new / learning / known) on each card.
        for w in all_words:
            w["status"] = progress_map.get(w["id"], "new")

        # Prioritize: new first → still learning → already known
        new_words = [w for w in all_words if w["status"] == "new"]
        learning_words = [w for w in all_words if w["status"] == "learning"]
        known_words = [w for w in all_words if w["status"] == "known"]
        random.shuffle(new_words)
        random.shuffle(learning_words)
        random.shuffle(known_words)
        all_words = new_words + learning_words + known_words
    else:
        for w in all_words:
            w["status"] = "new"
        random.shuffle(all_words)

    return all_words[:QUIZ_SIZE]


@router.get("/lists/{list_id}/progress")
def get_list_progress(
    list_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the authenticated user's progress breakdown for a single list.
    Used to show the progress bar on the list detail page."""
    wl = session.get(WordList, list_id)
    if not wl or wl.archived:
        raise HTTPException(status_code=404, detail="List not found")
    user = _require_user(authorization, session)
    word_ids = [w["id"] for w in _list_words(list_id, session)]
    progress_records = session.exec(
        select(UserWordProgress).where(
            UserWordProgress.user_id == user.id,
            col(UserWordProgress.word_id).in_(word_ids),
        )
    ).all()
    status_map = {p.word_id: p.status for p in progress_records}
    known = sum(1 for wid in word_ids if status_map.get(wid) == "known")
    learning = sum(1 for wid in word_ids if status_map.get(wid) == "learning")
    return {
        "total": len(word_ids),
        "known": known,
        "learning": learning,
        "new": len(word_ids) - known - learning,
    }


class ProgressUpdate(BaseModel):
    status: Literal["learning", "known"]
    mistake: bool = False       # True when the user answered this word incorrectly
    clear_mistake: bool = False  # True to reset mistake_count to 0 (word mastered in review)


@router.post("/words/{word_id}/progress")
def update_progress(
    word_id: int,
    body: ProgressUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Record the user's answer for a word during a study session.

    Called after each card flip. Upserts the UserWordProgress row —
    creates it on first answer, increments review_count on subsequent ones.
    When mistake=True, also increments mistake_count.
    """
    user = _require_user(authorization, session)
    progress = session.exec(
        select(UserWordProgress).where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.word_id == word_id,
        )
    ).first()
    if progress:
        progress.status = body.status
        progress.review_count += 1
        if body.mistake:
            progress.mistake_count += 1
        elif body.clear_mistake:
            progress.mistake_count = 0
        progress.last_seen = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        progress = UserWordProgress(
            user_id=user.id,
            word_id=word_id,
            status=body.status,
            review_count=1,
            mistake_count=1 if body.mistake else 0,
        )
        session.add(progress)
    session.commit()
    return {"ok": True}


def _quota_check_and_increment(user: User, session: Session) -> None:
    """Enforce the daily session limit for basic users. Raises 429 if exceeded."""
    if _is_premium_active(user):
        return
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
    if row.session_count >= DAILY_LIMIT:
        raise HTTPException(
            status_code=429,
            detail={"code": "daily_limit_reached", "limit": DAILY_LIMIT, "sessions_today": row.session_count},
        )
    row.session_count += 1
    session.commit()


def _word_to_dict(w: Word, status: str) -> dict:
    return {
        "id": w.id,
        "lithuanian": w.lithuanian,
        "translation_en": w.translation_en,
        "translation_ru": w.translation_ru,
        "hint": w.hint,
        "status": status,
    }


@router.get("/review/known")
def get_review_known(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return up to 10 known words for a refresh session, oldest-reviewed first.

    Words are ordered by last_seen ASC so the user revisits words they studied
    longest ago first (spaced-repetition-like ordering).
    Counts against the daily session quota same as regular study.
    """
    user = _require_user(authorization, session)
    _quota_check_and_increment(user, session)

    progress_records = session.exec(
        select(UserWordProgress)
        .where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.status == "known",
        )
        .order_by(UserWordProgress.last_seen)
        .limit(QUIZ_SIZE)
    ).all()

    if not progress_records:
        return []

    word_ids = [p.word_id for p in progress_records]
    words = session.exec(
        select(Word).where(col(Word.id).in_(word_ids), Word.archived == False)  # noqa: E712
    ).all()
    word_map = {w.id: w for w in words}

    return [
        _word_to_dict(word_map[p.word_id], p.status)
        for p in progress_records
        if p.word_id in word_map
    ]


@router.get("/review/mistakes")
def get_review_mistakes(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return up to 10 words the user has answered wrong, most-mistaken first.

    Counts against the daily session quota same as regular study.
    """
    user = _require_user(authorization, session)
    _quota_check_and_increment(user, session)

    progress_records = session.exec(
        select(UserWordProgress)
        .where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.mistake_count > 0,
        )
        .order_by(col(UserWordProgress.mistake_count).desc())
        .limit(QUIZ_SIZE)
    ).all()

    if not progress_records:
        return []

    word_ids = [p.word_id for p in progress_records]
    words = session.exec(
        select(Word).where(col(Word.id).in_(word_ids), Word.archived == False)  # noqa: E712
    ).all()
    word_map = {w.id: w for w in words}

    return [
        _word_to_dict(word_map[p.word_id], p.status)
        for p in progress_records
        if p.word_id in word_map
    ]


@router.get("/me/lists-progress")
def get_all_lists_progress(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return progress stats for all public lists in a single response.

    Optimized to use only 2 DB queries regardless of how many lists exist:
      1. Fetch all (list_id, word_id) pairs for public lists
      2. Fetch all progress records for this user
    Then aggregate counts in Python.
    """
    user = _require_user(authorization, session)

    # One query: all public list IDs + their word IDs
    rows = session.exec(
        select(WordListItem.word_list_id, WordListItem.word_id)
        .join(WordList, WordList.id == WordListItem.word_list_id)
        .where(WordList.is_public == True)
    ).all()

    # Group word IDs by list and collect the full set for the progress query
    list_word_ids: dict[int, list[int]] = {}
    all_word_ids: set[int] = set()
    for list_id, word_id in rows:
        list_word_ids.setdefault(list_id, []).append(word_id)
        all_word_ids.add(word_id)

    progress_records = session.exec(
        select(UserWordProgress).where(
            UserWordProgress.user_id == user.id,
            col(UserWordProgress.word_id).in_(list(all_word_ids)),
        )
    ).all() if all_word_ids else []
    status_map = {p.word_id: p.status for p in progress_records}

    result = {}
    for list_id, word_ids in list_word_ids.items():
        known = sum(1 for wid in word_ids if status_map.get(wid) == "known")
        learning = sum(1 for wid in word_ids if status_map.get(wid) == "learning")
        result[list_id] = {
            "total": len(word_ids),
            "known": known,
            "learning": learning,
            "new": len(word_ids) - known - learning,
        }
    return result


@router.get("/me/stats")
def get_stats(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return overall stats for the dashboard header: known/learning counts and study streak.

    The streak counts consecutive days on which the user studied at least one word,
    by looking at the set of unique dates in UserWordProgress.last_seen.
    """
    user = _require_user(authorization, session)
    all_progress = session.exec(
        select(UserWordProgress).where(UserWordProgress.user_id == user.id)
    ).all()
    known = sum(1 for p in all_progress if p.status == "known")
    learning = sum(1 for p in all_progress if p.status == "learning")
    mistakes = sum(1 for p in all_progress if p.mistake_count > 0)

    # Build a set of unique study dates, then count backwards from today
    studied_dates = {p.last_seen.date() for p in all_progress}
    today = datetime.now(timezone.utc).date()
    streak = 0
    # Start from today; if today wasn't a study day, check yesterday before giving up
    check = today if today in studied_dates else today - timedelta(days=1)
    while check in studied_dates:
        streak += 1
        check -= timedelta(days=1)
    return {"known": known, "learning": learning, "total_studied": known + learning, "streak": streak, "mistakes": mistakes}


@router.get("/me/known-words")
def get_known_words(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all words the user has learned (status='known'), ordered by last_seen DESC.

    Each word includes the title of the first list it belongs to (if any)
    so the frontend can group or label words by topic.
    """
    user = _require_user(authorization, session)

    progress_records = session.exec(
        select(UserWordProgress)
        .where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.status == "known",
        )
        .order_by(col(UserWordProgress.last_seen).desc())
    ).all()

    if not progress_records:
        return []

    word_ids = [p.word_id for p in progress_records]
    words = session.exec(
        select(Word).where(col(Word.id).in_(word_ids), Word.archived == False)  # noqa: E712
    ).all()
    word_map = {w.id: w for w in words}

    # One query to get a list title per word (use the first list found)
    list_rows = session.exec(
        select(WordListItem.word_id, WordList.title, WordList.title_en, WordList.id)
        .join(WordList, WordList.id == WordListItem.word_list_id)
        .where(col(WordListItem.word_id).in_(word_ids))
    ).all()
    list_title_map: dict[int, tuple[str, str | None, int]] = {}
    for wid, title, title_en, list_id in list_rows:
        if wid not in list_title_map:
            list_title_map[wid] = (title, title_en, list_id)

    result = []
    for p in progress_records:
        w = word_map.get(p.word_id)
        if not w:
            continue
        list_info = list_title_map.get(p.word_id)
        result.append({
            "id": w.id,
            "lithuanian": w.lithuanian,
            "translation_ru": w.translation_ru,
            "translation_en": w.translation_en,
            "hint": w.hint,
            "last_seen": p.last_seen.isoformat() if p.last_seen else None,
            "list_title": list_info[0] if list_info else None,
            "list_title_en": list_info[1] if list_info else None,
            "list_id": list_info[2] if list_info else None,
        })
    return result


@router.get("/me/quota")
def get_quota(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the current user's tier and daily session usage."""
    user = _require_user(authorization, session)
    premium_active = _is_premium_active(user)
    today = datetime.now(timezone.utc).date()
    row = session.exec(
        select(DailyStudySession).where(
            DailyStudySession.user_id == user.id,
            DailyStudySession.study_date == today,
        )
    ).first()
    sessions_today = row.session_count if row else 0
    return {
        "is_premium": user.is_premium,
        "premium_until": user.premium_until,
        "premium_active": premium_active,
        "sessions_today": sessions_today,
        "daily_limit": None if premium_active else DAILY_LIMIT,
        "is_admin": user.is_admin,
        "is_superadmin": user.is_superadmin,
    }
