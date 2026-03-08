import os
import random
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlmodel import Session, select

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
        raise HTTPException(status_code=404, detail="User not found")
    return user


def _list_words(list_id: int, session: Session) -> list[dict]:
    items = session.exec(
        select(WordListItem)
        .where(WordListItem.word_list_id == list_id)
        .order_by(WordListItem.position)
    ).all()
    words = []
    for item in items:
        word = session.get(Word, item.word_id)
        if word:
            words.append({
                "id": word.id,
                "lithuanian": word.lithuanian,
                "translation_en": word.translation_en,
                "translation_ru": word.translation_ru,
                "hint": word.hint,
            })
    return words


@router.get("/lists")
def get_lists(session: Session = Depends(get_session)):
    lists = session.exec(select(WordList).where(WordList.is_public == True)).all()
    result = []
    for wl in lists:
        count = session.exec(
            select(WordListItem).where(WordListItem.word_list_id == wl.id)
        ).all()
        result.append({
            "id": wl.id,
            "title": wl.title,
            "description": wl.description,
            "word_count": len(count),
        })
    return result


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


@router.get("/lists/{list_id}/study")
def get_study_words(list_id: int, session: Session = Depends(get_session)):
    wl = session.get(WordList, list_id)
    if not wl:
        raise HTTPException(status_code=404, detail="List not found")
    words = _list_words(list_id, session)
    random.shuffle(words)
    return words


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
