# Word lists and vocabulary study endpoints.
# Handles browsing lists, fetching study sessions, and recording per-word progress.

import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlmodel import Session, select, col, func

from core.database import get_session
from core.auth import JWT_SECRET, JWT_ALGORITHM
from models import User, Word, WordList, WordListItem, UserWordProgress

router = APIRouter()


def _require_user(authorization: Optional[str], session: Session) -> User:
    """Validate the Authorization header and return the corresponding User.

    Raises HTTP 401 if the token is missing or invalid.
    Auto-creates the DB row on first use to handle tokens issued before the
    user record existed (edge case during early testing or re-deployments).
    """
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
        # Auto-create user from valid JWT claims (handles tokens issued before DB row existed)
        user = User(
            email=email,
            name=payload.get("name", email),
            picture=payload.get("picture"),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
    return user


def _list_words(list_id: int, session: Session) -> list[dict]:
    """Fetch all words in a list ordered by their position in that list."""
    rows = session.exec(
        select(Word)
        .join(WordListItem, WordListItem.word_id == Word.id)
        .where(WordListItem.word_list_id == list_id)
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


@router.get("/lists")
def get_lists(session: Session = Depends(get_session)):
    """Return all public word lists with their word counts.
    Word counts are fetched in a single aggregation query to avoid N+1."""
    lists = session.exec(select(WordList).where(WordList.is_public == True, WordList.archived == False)).all()  # noqa: E712
    # Single aggregation query to get word counts for all lists at once
    counts = dict(
        session.exec(
            select(WordListItem.word_list_id, func.count(WordListItem.id))
            .group_by(WordListItem.word_list_id)
        ).all()
    )
    return [
        {
            "id": wl.id,
            "title": wl.title,
            "description": wl.description,
            "subcategory": wl.subcategory,
            "word_count": counts.get(wl.id, 0),
        }
        for wl in lists
    ]


@router.get("/lists/{list_id}")
def get_list(list_id: int, session: Session = Depends(get_session)):
    """Return a single list with all its words. Used on the list detail page."""
    wl = session.get(WordList, list_id)
    if not wl:
        raise HTTPException(status_code=404, detail="List not found")
    return {
        "id": wl.id,
        "title": wl.title,
        "description": wl.description,
        "words": _list_words(list_id, session),
    }


# Number of words returned per study session.
# Keeping it small ensures sessions feel achievable.
QUIZ_SIZE = 10


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
    if not wl:
        raise HTTPException(status_code=404, detail="List not found")

    all_words = _list_words(list_id, session)

    # Try to get authenticated user for progress-based prioritization.
    # Auth is optional here — unauthenticated users still get a study session.
    user = None
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ")[1]
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            email = payload.get("email")
            if email:
                user = session.exec(select(User).where(User.email == email)).first()
        except JWTError:
            pass  # Ignore bad tokens — fall back to anonymous mode

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
    if not wl:
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
    status: str  # "learning" | "known"


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
    """
    if body.status not in ("learning", "known"):
        raise HTTPException(status_code=400, detail="status must be 'learning' or 'known'")
    user = _require_user(authorization, session)
    progress = session.exec(
        select(UserWordProgress).where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.word_id == word_id,
        )
    ).first()
    if progress:
        # Update existing record
        progress.status = body.status
        progress.review_count += 1
        progress.last_seen = datetime.utcnow()
    else:
        # First time this user has seen this word
        progress = UserWordProgress(
            user_id=user.id,
            word_id=word_id,
            status=body.status,
            review_count=1,
        )
        session.add(progress)
    session.commit()
    return {"ok": True}


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

    # Build a set of unique study dates, then count backwards from today
    studied_dates = {p.last_seen.date() for p in all_progress}
    today = datetime.now(timezone.utc).date()
    streak = 0
    # Start from today; if today wasn't a study day, check yesterday before giving up
    check = today if today in studied_dates else today - timedelta(days=1)
    while check in studied_dates:
        streak += 1
        check -= timedelta(days=1)
    return {"known": known, "learning": learning, "total_studied": known + learning, "streak": streak}


@router.get("/me/quota")
def get_quota(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return quota and admin flags for the current user."""
    user = _require_user(authorization, session)
    return {"is_admin": user.is_admin, "is_superadmin": user.is_superadmin}
