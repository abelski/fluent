# User-created personal word lists ("Мои списки" for words).
# Private, owner-scoped word collections that premium users and admins create and
# study. Unlike the phrase feature, these reuse the shared Word/WordList/
# WordListItem/UserWordProgress tables so that progress on personal words flows
# into every global stat (vocabulary, streak, known counts, leaderboard, review)
# exactly like public-list words. A personal list is a WordList with
# is_public=False and created_by=<user>, not linked to any custom program.

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from auth import require_user as _require_user
from database import get_session
from quota import is_premium_active
from models import (
    CustomProgramList,
    User,
    Word,
    WordList,
    WordListItem,
    UserWordProgress,
)

router = APIRouter()

# Personal lists store difficulty in the shared WordList.difficulty string column.
_DIFFICULTY_BY_INT = {1: "easy", 2: "medium", 3: "hard"}
_INT_BY_DIFFICULTY = {v: k for k, v in _DIFFICULTY_BY_INT.items()}


# ── Access helpers ───────────────────────────────────────────────────────────

def _require_list_creator(user: User) -> None:
    """Only admins and active-premium users may create/edit personal lists."""
    if user.is_admin or is_premium_active(user):
        return
    raise HTTPException(
        status_code=403,
        detail="Personal word lists are available on Premium.",
    )


def _get_owned_list(list_id: int, user: User, session: Session) -> WordList:
    """Return the list if it's a personal list owned by the user, else 404."""
    wl = session.get(WordList, list_id)
    if not wl or wl.is_public or wl.archived or wl.created_by != user.id:
        raise HTTPException(status_code=404, detail="List not found")
    return wl


def _get_owned_word(word_id: int, user: User, session: Session) -> tuple[Word, WordListItem]:
    """Return (word, item) if the word belongs to a list owned by the user, else 404."""
    item = session.exec(
        select(WordListItem)
        .join(WordList, WordList.id == WordListItem.word_list_id)
        .where(
            WordListItem.word_id == word_id,
            WordList.created_by == user.id,
            WordList.is_public == False,  # noqa: E712
        )
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Word not found")
    word = session.get(Word, word_id)
    if not word:
        raise HTTPException(status_code=404, detail="Word not found")
    return word, item


def _next_position(list_id: int, session: Session) -> int:
    max_pos = session.exec(
        select(func.max(WordListItem.position)).where(WordListItem.word_list_id == list_id)
    ).first()
    return (max_pos + 1) if max_pos is not None else 0


def _parse_bulk(raw: str) -> list[tuple[str, str]]:
    """Parse pasted lines 'žodis = перевод' into (lithuanian, translation) pairs.

    Accepts '=', tab, or '—' as the separator. Skips blank and malformed lines."""
    pairs: list[tuple[str, str]] = []
    for line in raw.splitlines():
        line = line.strip()
        if not line:
            continue
        sep = None
        for candidate in ("\t", "=", "—"):
            if candidate in line:
                sep = candidate
                break
        if sep is None:
            continue
        left, _, right = line.partition(sep)
        lithuanian = left.strip()
        translation = right.strip()
        if lithuanian and translation:
            pairs.append((lithuanian, translation))
    return pairs


def _personal_list_ids(user: User, session: Session) -> list[int]:
    """IDs of the user's personal lists (owned, private, not in any custom program)."""
    owned = session.exec(
        select(WordList.id).where(
            WordList.created_by == user.id,
            WordList.is_public == False,  # noqa: E712
            WordList.archived == False,  # noqa: E712
        )
    ).all()
    if not owned:
        return []
    in_programs = set(
        session.exec(
            select(CustomProgramList.word_list_id).where(
                col(CustomProgramList.word_list_id).in_(owned)
            )
        ).all()
    )
    return [lid for lid in owned if lid not in in_programs]


# ── List CRUD ────────────────────────────────────────────────────────────────

class WordListCreate(BaseModel):
    title: str
    difficulty: int = 1


class WordListUpdate(BaseModel):
    title: str
    difficulty: int = 1


def _word_ids_in_list(list_id: int, session: Session) -> list[int]:
    return session.exec(
        select(WordListItem.word_id).where(WordListItem.word_list_id == list_id)
    ).all()


def _list_summary(wl: WordList, session: Session, user: User) -> dict:
    """Serialize a personal list with word count and known/learning/new counts."""
    word_ids = _word_ids_in_list(wl.id, session)
    known = learning = 0
    if word_ids:
        rows = session.exec(
            select(UserWordProgress).where(
                UserWordProgress.user_id == user.id,
                col(UserWordProgress.word_id).in_(word_ids),
            )
        ).all()
        status_map = {r.word_id: r.status for r in rows}
        known = sum(1 for wid in word_ids if status_map.get(wid) == "known")
        learning = sum(1 for wid in word_ids if status_map.get(wid) == "learning")
    return {
        "id": wl.id,
        "title": wl.title,
        "difficulty": _INT_BY_DIFFICULTY.get(wl.difficulty or "easy", 1),
        "word_count": len(word_ids),
        "created_at": wl.created_at.isoformat(),
        "known": known,
        "learning": learning,
        "new": len(word_ids) - known - learning,
    }


@router.get("/me/word-lists")
def list_my_word_lists(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all personal word lists owned by the current user."""
    user = _require_user(authorization, session)
    ids = _personal_list_ids(user, session)
    if not ids:
        return []
    lists = session.exec(
        select(WordList)
        .where(col(WordList.id).in_(ids))
        .order_by(col(WordList.created_at).desc())
    ).all()
    return [_list_summary(wl, session, user) for wl in lists]


@router.post("/me/word-lists")
def create_my_word_list(
    body: WordListCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Create a new personal word list (premium/admin only)."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required")
    if body.difficulty not in (1, 2, 3):
        raise HTTPException(status_code=422, detail="difficulty must be 1, 2, or 3")

    wl = WordList(
        title=title,
        is_public=False,
        created_by=user.id,
        difficulty=_DIFFICULTY_BY_INT[body.difficulty],
    )
    session.add(wl)
    session.commit()
    session.refresh(wl)
    return {"id": wl.id, "title": wl.title}


@router.get("/me/word-lists/{list_id}")
def get_my_word_list(
    list_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a personal list with its words and per-word status (for the edit page)."""
    user = _require_user(authorization, session)
    wl = _get_owned_list(list_id, user, session)

    words = session.exec(
        select(Word, WordListItem.position)
        .join(WordListItem, WordListItem.word_id == Word.id)
        .where(WordListItem.word_list_id == list_id, Word.archived == False)  # noqa: E712
        .order_by(WordListItem.position)
    ).all()
    status_map: dict[int, str] = {}
    if words:
        word_ids = [w.id for w, _ in words]
        rows = session.exec(
            select(UserWordProgress).where(
                UserWordProgress.user_id == user.id,
                col(UserWordProgress.word_id).in_(word_ids),
            )
        ).all()
        status_map = {r.word_id: r.status for r in rows}

    return {
        "id": wl.id,
        "title": wl.title,
        "difficulty": _INT_BY_DIFFICULTY.get(wl.difficulty or "easy", 1),
        "words": [
            {
                "id": w.id,
                "lithuanian": w.lithuanian,
                # Personal words mirror the single user translation into both columns.
                "translation": w.translation_ru or w.translation_en,
                "position": pos,
                "status": status_map.get(w.id, "new"),
            }
            for w, pos in words
        ],
    }


@router.put("/me/word-lists/{list_id}")
def update_my_word_list(
    list_id: int,
    body: WordListUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Rename or re-grade a personal list."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    wl = _get_owned_list(list_id, user, session)
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required")
    if body.difficulty not in (1, 2, 3):
        raise HTTPException(status_code=422, detail="difficulty must be 1, 2, or 3")
    wl.title = title
    wl.difficulty = _DIFFICULTY_BY_INT[body.difficulty]
    session.add(wl)
    session.commit()
    return {"ok": True}


@router.delete("/me/word-lists/{list_id}")
def delete_my_word_list(
    list_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Delete a personal list and all its words, list items, and progress."""
    user = _require_user(authorization, session)
    wl = _get_owned_list(list_id, user, session)

    word_ids = _word_ids_in_list(list_id, session)
    if word_ids:
        for prog in session.exec(
            select(UserWordProgress).where(col(UserWordProgress.word_id).in_(word_ids))
        ).all():
            session.delete(prog)
    for item in session.exec(
        select(WordListItem).where(WordListItem.word_list_id == list_id)
    ).all():
        session.delete(item)
    if word_ids:
        for word in session.exec(
            select(Word).where(col(Word.id).in_(word_ids))
        ).all():
            session.delete(word)
    session.delete(wl)
    session.commit()
    return {"ok": True}


# ── Word CRUD ────────────────────────────────────────────────────────────────

class WordCreate(BaseModel):
    lithuanian: str
    translation: str


class WordUpdate(BaseModel):
    lithuanian: str
    translation: str


class BulkWordsCreate(BaseModel):
    text: str  # raw pasted block, one "žodis = перевод" per line


@router.post("/me/word-lists/{list_id}/words")
def add_my_word(
    list_id: int,
    body: WordCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Add a single word to a personal list."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    _get_owned_list(list_id, user, session)
    lithuanian = body.lithuanian.strip()
    translation = body.translation.strip()
    if not lithuanian or not translation:
        raise HTTPException(status_code=422, detail="lithuanian and translation are required")
    word = Word(
        lithuanian=lithuanian,
        translation_en=translation,
        translation_ru=translation,
        star=1,
    )
    session.add(word)
    session.commit()
    session.refresh(word)
    session.add(WordListItem(
        word_list_id=list_id, word_id=word.id, position=_next_position(list_id, session),
    ))
    session.commit()
    return {"id": word.id}


@router.post("/me/word-lists/{list_id}/words/bulk")
def bulk_add_my_words(
    list_id: int,
    body: BulkWordsCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Add many words at once from a pasted block."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    _get_owned_list(list_id, user, session)
    pairs = _parse_bulk(body.text)
    if not pairs:
        raise HTTPException(status_code=422, detail="No valid 'žodis = перевод' lines found")
    pos = _next_position(list_id, session)
    for lithuanian, translation in pairs:
        word = Word(
            lithuanian=lithuanian,
            translation_en=translation,
            translation_ru=translation,
            star=1,
        )
        session.add(word)
        session.commit()
        session.refresh(word)
        session.add(WordListItem(word_list_id=list_id, word_id=word.id, position=pos))
        pos += 1
    session.commit()
    return {"added": len(pairs)}


@router.put("/me/word-lists/words/{word_id}")
def update_my_word(
    word_id: int,
    body: WordUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Edit a word in a personal list."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    word, _ = _get_owned_word(word_id, user, session)
    lithuanian = body.lithuanian.strip()
    translation = body.translation.strip()
    if not lithuanian or not translation:
        raise HTTPException(status_code=422, detail="lithuanian and translation are required")
    word.lithuanian = lithuanian
    word.translation_en = translation
    word.translation_ru = translation
    session.add(word)
    session.commit()
    return {"ok": True}


@router.delete("/me/word-lists/words/{word_id}")
def delete_my_word(
    word_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Delete a word from a personal list, plus its list item and progress rows."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    word, item = _get_owned_word(word_id, user, session)
    for prog in session.exec(
        select(UserWordProgress).where(UserWordProgress.word_id == word_id)
    ).all():
        session.delete(prog)
    session.delete(item)
    session.delete(word)
    session.commit()
    return {"ok": True}
