# User-created phrase lists ("Мои списки").
# Private, owner-scoped phrase collections that premium users and admins create
# and train. Reuses the SM-2 study engine (algorithm + PhraseSession UI) but
# stores data in its own tables (CustomPhraseList / CustomPhrase /
# UserCustomPhraseProgress), separate from the admin-curated PhraseProgram/Phrase.

import json
import random
from datetime import date, datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from auth import require_user as _require_user
from database import get_session
from quota import is_premium_active
from models import (
    CustomPhrase,
    CustomPhraseList,
    User,
    UserCustomPhraseProgress,
)
# Reuse the phrase SM-2 helpers so custom lists behave exactly like admin programs.
from routers.phrases import (
    DEFAULT_NEW_PHRASES_RATIO,
    DEFAULT_PHRASES_PER_SESSION,
    _apply_sm2_phrase,
    _pick_blank_word,
    _word_tiles,
)

router = APIRouter()


# ── Access helpers ───────────────────────────────────────────────────────────

def _require_list_creator(user: User) -> None:
    """Only admins and active-premium users may create/edit personal lists."""
    if user.is_admin or is_premium_active(user):
        return
    raise HTTPException(
        status_code=403,
        detail="Personal phrase lists are available on Premium.",
    )


def _get_owned_list(list_id: int, user: User, session: Session) -> CustomPhraseList:
    """Return the list if it exists and belongs to the user, else 404."""
    lst = session.get(CustomPhraseList, list_id)
    if not lst or lst.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="List not found")
    return lst


def _get_owned_phrase(phrase_id: int, user: User, session: Session) -> CustomPhrase:
    """Return the phrase if it belongs to a list owned by the user, else 404."""
    phrase = session.get(CustomPhrase, phrase_id)
    if not phrase:
        raise HTTPException(status_code=404, detail="Phrase not found")
    _get_owned_list(phrase.list_id, user, session)
    return phrase


def _translation_fields(text: str, user: User) -> tuple[str, Optional[str]]:
    """Map a single user-entered translation to (translation, translation_en).

    Phrases are user-generated in the owner's UI language: an English-UI owner's
    text is stored in translation_en (so English study mode shows it natively),
    while translation always holds the text too (NOT NULL + fallback for the
    other study direction)."""
    if (user.lang or "en") == "en":
        return text, text
    return text, None


def _parse_bulk(raw: str) -> list[tuple[str, str]]:
    """Parse pasted lines 'Lithuanian = translation' into (text, translation) pairs.

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
        text = left.strip()
        translation = right.strip()
        if text and translation:
            pairs.append((text, translation))
    return pairs


# ── List CRUD ────────────────────────────────────────────────────────────────

class PhraseListCreate(BaseModel):
    title: str
    difficulty: int = 1


class PhraseListUpdate(BaseModel):
    title: str
    difficulty: int = 1


def _list_summary(lst: CustomPhraseList, session: Session, user: User) -> dict:
    """Serialize a list with phrase count and progress stage distribution."""
    phrase_rows = session.exec(
        select(CustomPhrase.id, CustomPhrase.star).where(CustomPhrase.list_id == lst.id)
    ).all()
    phrase_ids = [r[0] for r in phrase_rows]
    stars = [r[1] for r in phrase_rows]
    stage_dist = {"stage0": 0, "stage1": 0, "stage2": 0}
    if phrase_ids:
        rows = session.exec(
            select(UserCustomPhraseProgress).where(
                UserCustomPhraseProgress.user_id == user.id,
                col(UserCustomPhraseProgress.custom_phrase_id).in_(phrase_ids),
            )
        ).all()
        prog_map = {r.custom_phrase_id: r.lesson_stage for r in rows}
        for pid in phrase_ids:
            stage = prog_map.get(pid, 0)
            stage_dist[f"stage{stage}"] = stage_dist.get(f"stage{stage}", 0) + 1
    return {
        "id": lst.id,
        "title": lst.title,
        "difficulty": lst.difficulty,
        "phrase_count": len(phrase_ids),
        "created_at": lst.created_at.isoformat(),
        "stage_distribution": stage_dist,
        "star_min": min(stars) if stars else None,
        "star_max": max(stars) if stars else None,
    }


@router.get("/me/phrase-lists")
def list_my_phrase_lists(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all phrase lists owned by the current user."""
    user = _require_user(authorization, session)
    lists = session.exec(
        select(CustomPhraseList)
        .where(CustomPhraseList.owner_user_id == user.id)
        .order_by(col(CustomPhraseList.created_at).desc())
    ).all()
    return [_list_summary(lst, session, user) for lst in lists]


@router.post("/me/phrase-lists")
def create_my_phrase_list(
    body: PhraseListCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Create a new personal phrase list (premium/admin only)."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required")
    if body.difficulty not in (1, 2, 3):
        raise HTTPException(status_code=422, detail="difficulty must be 1, 2, or 3")

    lst = CustomPhraseList(owner_user_id=user.id, title=title, difficulty=body.difficulty)
    session.add(lst)
    session.commit()
    session.refresh(lst)
    return {"id": lst.id, "title": lst.title}


@router.get("/me/phrase-lists/{list_id}")
def get_my_phrase_list(
    list_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a personal list with its phrases and per-phrase progress."""
    user = _require_user(authorization, session)
    lst = _get_owned_list(list_id, user, session)

    phrases = session.exec(
        select(CustomPhrase)
        .where(CustomPhrase.list_id == list_id)
        .order_by(CustomPhrase.position)
    ).all()
    progress_map: dict[int, int] = {}
    if phrases:
        phrase_ids = [p.id for p in phrases if p.id is not None]
        rows = session.exec(
            select(UserCustomPhraseProgress).where(
                UserCustomPhraseProgress.user_id == user.id,
                col(UserCustomPhraseProgress.custom_phrase_id).in_(phrase_ids),
            )
        ).all()
        progress_map = {r.custom_phrase_id: r.lesson_stage for r in rows}

    return {
        "id": lst.id,
        "title": lst.title,
        "difficulty": lst.difficulty,
        "phrases": [
            {
                "id": p.id,
                "text": p.text,
                "translation": p.translation,
                "translation_en": p.translation_en,
                "position": p.position,
                "star": p.star,
                "lesson_stage": progress_map.get(p.id, 0),
            }
            for p in phrases
        ],
    }


@router.put("/me/phrase-lists/{list_id}")
def update_my_phrase_list(
    list_id: int,
    body: PhraseListUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Rename or re-grade a personal list."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    lst = _get_owned_list(list_id, user, session)
    title = body.title.strip()
    if not title:
        raise HTTPException(status_code=422, detail="title is required")
    if body.difficulty not in (1, 2, 3):
        raise HTTPException(status_code=422, detail="difficulty must be 1, 2, or 3")
    lst.title = title
    lst.difficulty = body.difficulty
    session.add(lst)
    session.commit()
    return {"ok": True}


@router.delete("/me/phrase-lists/{list_id}")
def delete_my_phrase_list(
    list_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Delete a personal list and all its phrases and progress."""
    user = _require_user(authorization, session)
    lst = _get_owned_list(list_id, user, session)

    phrase_ids = session.exec(
        select(CustomPhrase.id).where(CustomPhrase.list_id == list_id)
    ).all()
    if phrase_ids:
        for prog in session.exec(
            select(UserCustomPhraseProgress).where(
                col(UserCustomPhraseProgress.custom_phrase_id).in_(phrase_ids)
            )
        ).all():
            session.delete(prog)
        for phrase in session.exec(
            select(CustomPhrase).where(CustomPhrase.list_id == list_id)
        ).all():
            session.delete(phrase)
    session.delete(lst)
    session.commit()
    return {"ok": True}


# ── Phrase CRUD ──────────────────────────────────────────────────────────────

def _phrase_star(text: str) -> int:
    """Auto complexity from word count: <=3 words = 1, 4-6 = 2, 7+ = 3."""
    n = len(text.split())
    if n <= 3:
        return 1
    if n <= 6:
        return 2
    return 3


class PhraseCreate(BaseModel):
    text: str
    translation: str
    translation_en: Optional[str] = None


class PhraseUpdate(BaseModel):
    text: str
    translation: str
    translation_en: Optional[str] = None
    star: Optional[int] = None  # manual complexity override (1-3)


class BulkPhrasesCreate(BaseModel):
    text: str  # raw pasted block, one "фраза = перевод" per line


def _next_position(list_id: int, session: Session) -> int:
    max_pos = session.exec(
        select(func.max(CustomPhrase.position)).where(CustomPhrase.list_id == list_id)
    ).first()
    return (max_pos + 1) if max_pos is not None else 0


@router.post("/me/phrase-lists/{list_id}/phrases")
def add_my_phrase(
    list_id: int,
    body: PhraseCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Add a single phrase to a personal list."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    _get_owned_list(list_id, user, session)
    text = body.text.strip()
    translation = body.translation.strip()
    if not text or not translation:
        raise HTTPException(status_code=422, detail="text and translation are required")
    tr_ru, tr_en = _translation_fields(translation, user)
    if body.translation_en:
        tr_en = body.translation_en.strip() or tr_en
    phrase = CustomPhrase(
        list_id=list_id,
        text=text,
        translation=tr_ru,
        translation_en=tr_en,
        position=_next_position(list_id, session),
        star=_phrase_star(text),
    )
    session.add(phrase)
    session.commit()
    session.refresh(phrase)
    return {"id": phrase.id}


@router.post("/me/phrase-lists/{list_id}/phrases/bulk")
def bulk_add_my_phrases(
    list_id: int,
    body: BulkPhrasesCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Add many phrases at once from a pasted block."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    _get_owned_list(list_id, user, session)
    pairs = _parse_bulk(body.text)
    if not pairs:
        raise HTTPException(status_code=422, detail="No valid 'фраза = перевод' lines found")
    pos = _next_position(list_id, session)
    for text, translation in pairs:
        tr_ru, tr_en = _translation_fields(translation, user)
        session.add(CustomPhrase(
            list_id=list_id, text=text, translation=tr_ru, translation_en=tr_en, position=pos,
            star=_phrase_star(text),
        ))
        pos += 1
    session.commit()
    return {"added": len(pairs)}


@router.put("/me/phrase-lists/phrases/{phrase_id}")
def update_my_phrase(
    phrase_id: int,
    body: PhraseUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Edit a phrase in a personal list."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    phrase = _get_owned_phrase(phrase_id, user, session)
    text = body.text.strip()
    translation = body.translation.strip()
    if not text or not translation:
        raise HTTPException(status_code=422, detail="text and translation are required")
    tr_ru, tr_en = _translation_fields(translation, user)
    if body.translation_en:
        tr_en = body.translation_en.strip() or tr_en
    phrase.text = text
    phrase.translation = tr_ru
    phrase.translation_en = tr_en
    if body.star is not None:
        if body.star not in (1, 2, 3):
            raise HTTPException(status_code=422, detail="star must be 1, 2, or 3")
        phrase.star = body.star
    session.add(phrase)
    session.commit()
    return {"ok": True}


@router.delete("/me/phrase-lists/phrases/{phrase_id}")
def delete_my_phrase(
    phrase_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Delete a phrase from a personal list and its progress rows."""
    user = _require_user(authorization, session)
    _require_list_creator(user)
    phrase = _get_owned_phrase(phrase_id, user, session)
    for prog in session.exec(
        select(UserCustomPhraseProgress).where(
            UserCustomPhraseProgress.custom_phrase_id == phrase_id
        )
    ).all():
        session.delete(prog)
    session.delete(phrase)
    session.commit()
    return {"ok": True}


# ── Study session ────────────────────────────────────────────────────────────

@router.get("/me/phrase-lists/{list_id}/study")
def get_my_phrase_list_study(
    list_id: int,
    star_level: int = Query(default=1, ge=1, le=3),
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a prioritized study batch for a personal list.

    Mirrors get_phrase_study_session: due-for-review phrases first, then new
    ones, limited to the user's phrases_per_session, each carrying lesson_stage,
    blank_word, and MCQ distractors so PhraseSession can render it unchanged.

    star_level filters which phrases are included (same as word lists):
    1 = only star=1 phrases, 2 = star<=2, 3 = all. When every phrase at the
    level is mastered, returns {"phrases": [], "all_known": true} so the
    frontend can offer advancing to the next level."""
    user = _require_user(authorization, session)
    _require_list_creator(user)  # studying/reviewing personal lists needs active Premium
    _get_owned_list(list_id, user, session)

    all_phrases = session.exec(
        select(CustomPhrase)
        .where(CustomPhrase.list_id == list_id)
        .order_by(CustomPhrase.position)
    ).all()
    if not all_phrases:
        raise HTTPException(status_code=404, detail="No phrases in this list")

    phrase_ids = [p.id for p in all_phrases]
    progress_rows = session.exec(
        select(UserCustomPhraseProgress).where(
            UserCustomPhraseProgress.user_id == user.id,
            col(UserCustomPhraseProgress.custom_phrase_id).in_(phrase_ids),
        )
    ).all()
    progress_map = {r.custom_phrase_id: r for r in progress_rows}

    today = date.today()
    total = user.phrases_per_session if user.phrases_per_session else DEFAULT_PHRASES_PER_SESSION

    level_phrases = [p for p in all_phrases if p.star <= star_level]

    due_phrases = []
    new_phrases = []
    for phrase in level_phrases:
        prog = progress_map.get(phrase.id)
        if prog is None:
            new_phrases.append(phrase)
        elif prog.next_review is not None and prog.next_review <= today:
            due_phrases.append(phrase)
        elif prog.lesson_stage < 2:
            due_phrases.append(phrase)

    ratio = user.new_phrases_ratio if user.new_phrases_ratio is not None else DEFAULT_NEW_PHRASES_RATIO
    new_count = round(total * ratio)
    review_count = total - new_count
    actual_new = min(new_count, len(new_phrases))
    actual_review = min(review_count + (new_count - actual_new), len(due_phrases))
    session_phrases = due_phrases[:actual_review] + new_phrases[:actual_new]

    if not session_phrases:
        # Everything at this star level is mastered (or the level has no
        # phrases) — let the frontend show the level-complete screen.
        return {"phrases": [], "all_known": True}

    other_phrase_words: list[str] = []
    session_phrase_ids = {p.id for p in session_phrases}
    for phrase in all_phrases:
        if phrase.id not in session_phrase_ids:
            words = [w.strip(".,!?;:'\"()") for w in phrase.text.split() if len(w.strip(".,!?;:'\"()")) > 1]
            other_phrase_words.extend(words)
    random.shuffle(other_phrase_words)
    distractor_pool = list(dict.fromkeys(other_phrase_words))

    result = []
    for phrase in session_phrases:
        prog = progress_map.get(phrase.id)
        lesson_stage = prog.lesson_stage if prog else 0
        mistake_words_json = prog.mistake_words_json if prog else "{}"
        blank_word = _pick_blank_word(phrase.text, mistake_words_json)
        mcq_distractors = [w for w in distractor_pool if w.lower() != blank_word.lower()][:3]
        result.append({
            "id": phrase.id,
            "text": phrase.text,
            "translation": phrase.translation,
            "translation_en": phrase.translation_en,
            "alt_texts": phrase.alt_texts,
            "lesson_stage": lesson_stage,
            "blank_word": blank_word,
            "mcq_distractors": mcq_distractors,
            "word_tiles": _word_tiles(phrase.text),
            "next_review": prog.next_review.isoformat() if prog and prog.next_review else None,
        })

    return {"phrases": result}


class CustomPhraseProgressUpdate(BaseModel):
    quality: int
    stage_completed: int
    mistake_word: Optional[str] = None


@router.post("/me/phrase-lists/phrases/{phrase_id}/progress")
def update_my_phrase_progress(
    phrase_id: int,
    body: CustomPhraseProgressUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Record the user's result for a custom-list phrase (SM-2)."""
    if body.quality not in range(6):
        raise HTTPException(status_code=422, detail="quality must be 0–5")
    if body.stage_completed not in (0, 1, 2):
        raise HTTPException(status_code=422, detail="stage_completed must be 0, 1, or 2")

    user = _require_user(authorization, session)
    _require_list_creator(user)  # recording progress needs active Premium
    phrase = _get_owned_phrase(phrase_id, user, session)

    progress = session.exec(
        select(UserCustomPhraseProgress).where(
            UserCustomPhraseProgress.user_id == user.id,
            UserCustomPhraseProgress.custom_phrase_id == phrase_id,
        )
    ).first()
    if progress is None:
        progress = UserCustomPhraseProgress(
            user_id=user.id, custom_phrase_id=phrase_id, lesson_stage=0,
        )
        session.add(progress)

    if body.mistake_word:
        try:
            mistake_map: dict[str, int] = json.loads(progress.mistake_words_json)
        except Exception:
            mistake_map = {}
        word_key = body.mistake_word.lower().strip(".,!?;:'\"()")
        mistake_map[word_key] = mistake_map.get(word_key, 0) + 1
        progress.mistake_words_json = json.dumps(mistake_map, ensure_ascii=False)
        progress.mistake_count += 1

    if body.quality >= 3 and body.stage_completed == progress.lesson_stage:
        progress.lesson_stage = min(2, progress.lesson_stage + 1)

    _apply_sm2_phrase(progress, body.quality)
    progress.last_seen = datetime.now(timezone.utc).replace(tzinfo=None)

    session.add(progress)
    session.commit()

    return {
        "lesson_stage": progress.lesson_stage,
        "next_review": progress.next_review.isoformat() if progress.next_review else None,
        "interval": progress.interval,
    }
