import os
import random
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlmodel import Session, select, col, func

from database import get_session
from models import User, Word, WordList, WordListItem, UserWordProgress

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"


def _require_user(authorization: Optional[str], session: Session) -> User:
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
    lists = session.exec(select(WordList).where(WordList.is_public == True)).all()
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
            "word_count": counts.get(wl.id, 0),
        }
        for wl in lists
    ]


@router.get("/lists/{list_id}")
def get_list(list_id: int, session: Session = Depends(get_session)):
    wl = session.get(WordList, list_id)
    if not wl:
        raise HTTPException(status_code=404, detail="List not found")
    return {
        "id": wl.id,
        "title": wl.title,
        "description": wl.description,
        "words": _list_words(list_id, session),
    }


QUIZ_SIZE = 10


@router.get("/lists/{list_id}/study")
def get_study_words(
    list_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    wl = session.get(WordList, list_id)
    if not wl:
        raise HTTPException(status_code=404, detail="List not found")

    all_words = _list_words(list_id, session)

    # Try to get authenticated user for progress-based prioritization
    user = None
    if authorization and authorization.startswith("Bearer "):
        try:
            token = authorization.split(" ")[1]
            payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
            email = payload.get("email")
            if email:
                user = session.exec(select(User).where(User.email == email)).first()
        except JWTError:
            pass

    if user and all_words:
        word_ids = [w["id"] for w in all_words]
        progress_records = session.exec(
            select(UserWordProgress).where(
                UserWordProgress.user_id == user.id,
                col(UserWordProgress.word_id).in_(word_ids),
            )
        ).all()
        progress_map = {p.word_id: p.status for p in progress_records}

        # Annotate words with their status for the frontend
        for w in all_words:
            w["status"] = progress_map.get(w["id"], "new")

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
        progress.status = body.status
        progress.review_count += 1
        progress.last_seen = datetime.utcnow()
    else:
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
    user = _require_user(authorization, session)

    # One query: all public list IDs + their word IDs
    rows = session.exec(
        select(WordListItem.word_list_id, WordListItem.word_id)
        .join(WordList, WordList.id == WordListItem.word_list_id)
        .where(WordList.is_public == True)
    ).all()

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
    user = _require_user(authorization, session)
    all_progress = session.exec(
        select(UserWordProgress).where(UserWordProgress.user_id == user.id)
    ).all()
    known = sum(1 for p in all_progress if p.status == "known")
    learning = sum(1 for p in all_progress if p.status == "learning")
    return {"known": known, "learning": learning, "total_studied": known + learning}
