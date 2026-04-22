# Phrases learning endpoints.
# Handles phrase programs (admin CRUD), enrollment, study sessions, and progress recording.
# Follows the same SM-2 spaced-repetition pattern as routers/words.py.

import json
import random
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, col, func, select

from auth import require_user as _require_user, try_get_user as _try_get_user
from database import get_session
from models import (
    Phrase,
    PhraseProgram,
    User,
    UserPhraseProgramEnrollment,
    UserPhraseProgress,
)

router = APIRouter()

DEFAULT_PHRASES_PER_SESSION = 10


# ── SM-2 spaced repetition (same algorithm as words.py) ─────────────────────

def _apply_sm2_phrase(progress: UserPhraseProgress, quality: int) -> None:
    """Update SM-2 fields on a UserPhraseProgress row in-place."""
    ef = progress.ease_factor
    interval = progress.interval
    reps = progress.sm2_reps

    if quality < 3:
        reps = 0
        interval = 1
    else:
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = round(interval * ef)
        reps += 1
        ef = ef + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
        ef = max(1.3, ef)

    progress.sm2_reps = reps
    progress.ease_factor = round(ef, 4)
    progress.interval = interval
    progress.next_review = date.today() + timedelta(days=interval)


def _pick_blank_word(phrase_text: str, mistake_words_json: str) -> str:
    """Choose which word to blank in stage 1.

    Picks the word with the highest mistake count. Falls back to a random
    content word (skipping single-char words like punctuation tokens)."""
    words = [w.strip(".,!?;:'\"()") for w in phrase_text.split()]
    words = [w for w in words if len(w) > 1]
    if not words:
        words = phrase_text.split()

    try:
        mistake_map: dict[str, int] = json.loads(mistake_words_json)
    except Exception:
        mistake_map = {}

    if mistake_map:
        # Find the word in this phrase with the most mistakes
        best = max(words, key=lambda w: mistake_map.get(w.lower(), 0))
        if mistake_map.get(best.lower(), 0) > 0:
            return best

    return random.choice(words)


# ── Program endpoints ────────────────────────────────────────────────────────

@router.get("/phrase-programs")
def list_phrase_programs(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all public phrase programs with phrase count and enrollment status."""
    user = _try_get_user(authorization, session)
    programs = session.exec(
        select(PhraseProgram).where(PhraseProgram.is_public == True)  # noqa: E712
    ).all()

    # Phrase counts per program
    count_rows = session.exec(
        select(Phrase.program_id, func.count(Phrase.id))
        .group_by(Phrase.program_id)
    ).all()
    phrase_counts = {pid: cnt for pid, cnt in count_rows}

    # Enrollment status for current user
    enrolled_ids: set[int] = set()
    if user:
        enrollments = session.exec(
            select(UserPhraseProgramEnrollment).where(
                UserPhraseProgramEnrollment.user_id == user.id
            )
        ).all()
        enrolled_ids = {e.program_id for e in enrollments}

    # Progress stage distribution per enrolled program
    stage_dist: dict[int, dict[str, int]] = {}
    if user and enrolled_ids:
        phrase_ids_by_program: dict[int, list[int]] = {}
        for p in programs:
            if p.id in enrolled_ids:
                pids = session.exec(
                    select(Phrase.id).where(Phrase.program_id == p.id)
                ).all()
                phrase_ids_by_program[p.id] = list(pids)

        for pid, phrase_ids in phrase_ids_by_program.items():
            if not phrase_ids:
                stage_dist[pid] = {"stage0": 0, "stage1": 0, "stage2": 0}
                continue
            progress_rows = session.exec(
                select(UserPhraseProgress).where(
                    UserPhraseProgress.user_id == user.id,
                    col(UserPhraseProgress.phrase_id).in_(phrase_ids),
                )
            ).all()
            prog_map = {r.phrase_id: r.lesson_stage for r in progress_rows}
            s = {0: 0, 1: 0, 2: 0}
            for phrase_id in phrase_ids:
                stage = prog_map.get(phrase_id, 0)
                s[stage] = s.get(stage, 0) + 1
            stage_dist[pid] = {"stage0": s[0], "stage1": s[1], "stage2": s[2]}

    return [
        {
            "id": p.id,
            "title": p.title,
            "title_en": p.title_en,
            "description": p.description,
            "description_en": p.description_en,
            "difficulty": p.difficulty,
            "phrase_count": phrase_counts.get(p.id, 0),
            "enrolled": p.id in enrolled_ids,
            "stage_distribution": stage_dist.get(p.id, None),
        }
        for p in programs
    ]


@router.get("/admin/phrase-programs")
def admin_list_phrase_programs(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: return all phrase programs (including non-public) with stats."""
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")

    programs = session.exec(select(PhraseProgram)).all()

    count_rows = session.exec(
        select(Phrase.program_id, func.count(Phrase.id)).group_by(Phrase.program_id)
    ).all()
    phrase_counts = {pid: cnt for pid, cnt in count_rows}

    enrollment_rows = session.exec(
        select(
            UserPhraseProgramEnrollment.program_id,
            func.count(func.distinct(UserPhraseProgramEnrollment.user_id)),
        ).group_by(UserPhraseProgramEnrollment.program_id)
    ).all()
    enrollment_counts = {pid: cnt for pid, cnt in enrollment_rows}

    return [
        {
            "id": p.id,
            "title": p.title,
            "title_en": p.title_en,
            "description": p.description,
            "description_en": p.description_en,
            "difficulty": p.difficulty,
            "is_public": p.is_public,
            "phrase_count": phrase_counts.get(p.id, 0),
            "enrolled_count": enrollment_counts.get(p.id, 0),
            "created_at": p.created_at.isoformat(),
        }
        for p in programs
    ]


class PhraseProgramCreate(BaseModel):
    title: str
    title_en: Optional[str] = None
    description: Optional[str] = None
    description_en: Optional[str] = None
    difficulty: int = 1
    is_public: bool = True


@router.post("/admin/phrase-programs")
def admin_create_phrase_program(
    body: PhraseProgramCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: create a new phrase program."""
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title is required")
    if body.difficulty not in (1, 2, 3):
        raise HTTPException(status_code=422, detail="difficulty must be 1, 2, or 3")

    program = PhraseProgram(
        title=body.title.strip(),
        title_en=body.title_en,
        description=body.description,
        description_en=body.description_en,
        difficulty=body.difficulty,
        is_public=body.is_public,
    )
    session.add(program)
    session.commit()
    session.refresh(program)
    return {"id": program.id, "title": program.title}


@router.put("/admin/phrase-programs/{program_id}")
def admin_update_phrase_program(
    program_id: int,
    body: PhraseProgramCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: update a phrase program."""
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    program = session.get(PhraseProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="title is required")
    if body.difficulty not in (1, 2, 3):
        raise HTTPException(status_code=422, detail="difficulty must be 1, 2, or 3")

    program.title = body.title.strip()
    program.title_en = body.title_en
    program.description = body.description
    program.description_en = body.description_en
    program.difficulty = body.difficulty
    program.is_public = body.is_public
    session.add(program)
    session.commit()
    return {"id": program.id, "title": program.title}


@router.delete("/admin/phrase-programs/{program_id}")
def admin_delete_phrase_program(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: delete a phrase program and all its phrases."""
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    program = session.get(PhraseProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    # Delete dependent rows first
    phrases = session.exec(select(Phrase).where(Phrase.program_id == program_id)).all()
    phrase_ids = [p.id for p in phrases]
    if phrase_ids:
        progress_rows = session.exec(
            select(UserPhraseProgress).where(col(UserPhraseProgress.phrase_id).in_(phrase_ids))
        ).all()
        for row in progress_rows:
            session.delete(row)
        for phrase in phrases:
            session.delete(phrase)
    enrollments = session.exec(
        select(UserPhraseProgramEnrollment).where(
            UserPhraseProgramEnrollment.program_id == program_id
        )
    ).all()
    for e in enrollments:
        session.delete(e)
    session.delete(program)
    session.commit()
    return {"ok": True}


# ── Phrase CRUD (admin) ──────────────────────────────────────────────────────

@router.get("/admin/phrase-programs/{program_id}/phrases")
def admin_list_phrases(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: list all phrases in a program."""
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    program = session.get(PhraseProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    phrases = session.exec(
        select(Phrase).where(Phrase.program_id == program_id).order_by(Phrase.position)
    ).all()
    return [
        {
            "id": p.id, "text": p.text,
            "translation": p.translation, "translation_en": p.translation_en,
            "position": p.position, "chapter": p.chapter, "chapter_title": p.chapter_title,
        }
        for p in phrases
    ]


class PhraseCreate(BaseModel):
    text: str
    translation: str
    translation_en: Optional[str] = None
    position: int = 0


@router.post("/admin/phrase-programs/{program_id}/phrases")
def admin_create_phrase(
    program_id: int,
    body: PhraseCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: add a phrase to a program."""
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    program = session.get(PhraseProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="text is required")
    if not body.translation.strip():
        raise HTTPException(status_code=422, detail="translation is required")

    phrase = Phrase(
        program_id=program_id,
        text=body.text.strip(),
        translation=body.translation.strip(),
        translation_en=body.translation_en.strip() if body.translation_en else None,
        position=body.position,
    )
    session.add(phrase)
    session.commit()
    session.refresh(phrase)
    return {"id": phrase.id, "text": phrase.text, "translation": phrase.translation, "translation_en": phrase.translation_en, "position": phrase.position}


@router.put("/admin/phrases/{phrase_id}")
def admin_update_phrase(
    phrase_id: int,
    body: PhraseCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: update a phrase."""
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    phrase = session.get(Phrase, phrase_id)
    if not phrase:
        raise HTTPException(status_code=404, detail="Phrase not found")
    if not body.text.strip():
        raise HTTPException(status_code=422, detail="text is required")
    if not body.translation.strip():
        raise HTTPException(status_code=422, detail="translation is required")

    phrase.text = body.text.strip()
    phrase.translation = body.translation.strip()
    phrase.translation_en = body.translation_en.strip() if body.translation_en else None
    phrase.position = body.position
    session.add(phrase)
    session.commit()
    return {"id": phrase.id, "text": phrase.text, "translation": phrase.translation, "translation_en": phrase.translation_en, "position": phrase.position}


@router.delete("/admin/phrases/{phrase_id}")
def admin_delete_phrase(
    phrase_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: delete a phrase."""
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    phrase = session.get(Phrase, phrase_id)
    if not phrase:
        raise HTTPException(status_code=404, detail="Phrase not found")
    progress_rows = session.exec(
        select(UserPhraseProgress).where(UserPhraseProgress.phrase_id == phrase_id)
    ).all()
    for row in progress_rows:
        session.delete(row)
    session.delete(phrase)
    session.commit()
    return {"ok": True}


@router.get("/admin/phrase-programs/{program_id}/stats")
def admin_phrase_program_stats(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: enrollment count and stage distribution for a program."""
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin required")
    program = session.get(PhraseProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    enrolled_count = session.exec(
        select(func.count(UserPhraseProgramEnrollment.id)).where(
            UserPhraseProgramEnrollment.program_id == program_id
        )
    ).one()

    phrase_ids = session.exec(
        select(Phrase.id).where(Phrase.program_id == program_id)
    ).all()

    stage_counts = {0: 0, 1: 0, 2: 0}
    if phrase_ids:
        progress_rows = session.exec(
            select(UserPhraseProgress.lesson_stage, func.count(UserPhraseProgress.id))
            .where(col(UserPhraseProgress.phrase_id).in_(list(phrase_ids)))
            .group_by(UserPhraseProgress.lesson_stage)
        ).all()
        for stage, cnt in progress_rows:
            stage_counts[stage] = cnt

    return {
        "enrolled_count": enrolled_count,
        "stage_distribution": {
            "stage0": stage_counts[0],
            "stage1": stage_counts[1],
            "stage2": stage_counts[2],
        },
    }


# ── Program detail (user-facing) ─────────────────────────────────────────────

@router.get("/phrase-programs/{program_id}")
def get_phrase_program(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a phrase program's details and its full phrase list.

    If the user is authenticated, each phrase also carries the user's current
    lesson_stage (0=new, 1=fill-word, 2=type-full) so the frontend can show
    per-phrase progress.
    """
    program = session.get(PhraseProgram, program_id)
    if not program or not program.is_public:
        raise HTTPException(status_code=404, detail="Program not found")

    phrases = session.exec(
        select(Phrase)
        .where(Phrase.program_id == program_id)
        .order_by(Phrase.position)
    ).all()

    # Per-phrase progress for authenticated users
    user = _try_get_user(authorization, session)
    progress_map: dict[int, int] = {}
    if user and phrases:
        phrase_ids = [p.id for p in phrases if p.id is not None]
        rows = session.exec(
            select(UserPhraseProgress).where(
                UserPhraseProgress.user_id == user.id,
                col(UserPhraseProgress.phrase_id).in_(phrase_ids),
            )
        ).all()
        progress_map = {r.phrase_id: r.lesson_stage for r in rows}

    return {
        "id": program.id,
        "title": program.title,
        "title_en": program.title_en,
        "description": program.description,
        "description_en": program.description_en,
        "difficulty": program.difficulty,
        "phrases": [
            {
                "id": p.id,
                "text": p.text,
                "translation": p.translation,
                "translation_en": p.translation_en,
                "chapter": p.chapter,
                "chapter_title": p.chapter_title,
                "position": p.position,
                "lesson_stage": progress_map.get(p.id, 0),
            }
            for p in phrases
        ],
    }


# ── Enrollment ───────────────────────────────────────────────────────────────

@router.post("/me/phrase-programs/{program_id}")
def enroll_phrase_program(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Enroll the current user in a phrase program."""
    user = _require_user(authorization, session)
    program = session.get(PhraseProgram, program_id)
    if not program or not program.is_public:
        raise HTTPException(status_code=404, detail="Program not found")

    existing = session.exec(
        select(UserPhraseProgramEnrollment).where(
            UserPhraseProgramEnrollment.user_id == user.id,
            UserPhraseProgramEnrollment.program_id == program_id,
        )
    ).first()
    if existing:
        return {"ok": True}

    session.add(UserPhraseProgramEnrollment(user_id=user.id, program_id=program_id))
    session.commit()
    return {"ok": True}


@router.delete("/me/phrase-programs/{program_id}")
def unenroll_phrase_program(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Unenroll the current user from a phrase program."""
    user = _require_user(authorization, session)
    existing = session.exec(
        select(UserPhraseProgramEnrollment).where(
            UserPhraseProgramEnrollment.user_id == user.id,
            UserPhraseProgramEnrollment.program_id == program_id,
        )
    ).first()
    if existing:
        session.delete(existing)
        session.commit()
    return {"ok": True}


# ── Study session ────────────────────────────────────────────────────────────

@router.get("/phrase-programs/{program_id}/study")
def get_phrase_study_session(
    program_id: int,
    chapter: Optional[int] = None,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a prioritized batch of phrases for a study session.

    Batch composition:
      - Phrases due for review (next_review ≤ today) come first
      - New phrases (no progress record) fill remaining slots
      - Total limited to user.phrases_per_session (default 10)

    Each phrase includes:
      - lesson_stage (0/1/2): which exercise type to show
      - blank_word: the word to blank in stage 1 (hardest by mistake history)
      - distractors: 3 other phrase words for MCQ options in stage 1
    """
    user = _require_user(authorization, session)

    program = session.get(PhraseProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")

    # Check enrollment
    enrollment = session.exec(
        select(UserPhraseProgramEnrollment).where(
            UserPhraseProgramEnrollment.user_id == user.id,
            UserPhraseProgramEnrollment.program_id == program_id,
        )
    ).first()
    if not enrollment:
        raise HTTPException(status_code=403, detail="Not enrolled in this program")

    phrase_query = select(Phrase).where(Phrase.program_id == program_id)
    if chapter is not None:
        phrase_query = phrase_query.where(Phrase.chapter == chapter)
    all_phrases = session.exec(phrase_query.order_by(Phrase.position)).all()
    if not all_phrases:
        raise HTTPException(status_code=404, detail="No phrases in this program")

    phrase_ids = [p.id for p in all_phrases]
    progress_rows = session.exec(
        select(UserPhraseProgress).where(
            UserPhraseProgress.user_id == user.id,
            col(UserPhraseProgress.phrase_id).in_(phrase_ids),
        )
    ).all()
    progress_map = {r.phrase_id: r for r in progress_rows}

    today = date.today()
    total = user.phrases_per_session if user.phrases_per_session else DEFAULT_PHRASES_PER_SESSION

    # Split into due vs new
    due_phrases = []
    new_phrases = []
    for phrase in all_phrases:
        prog = progress_map.get(phrase.id)
        if prog is None:
            new_phrases.append(phrase)
        elif prog.next_review is not None and prog.next_review <= today:
            due_phrases.append(phrase)
        elif prog.lesson_stage < 2:
            # In-progress phrases not yet due — include as review
            due_phrases.append(phrase)

    # Prioritize due, fill with new
    session_phrases = due_phrases[:total]
    remaining = total - len(session_phrases)
    if remaining > 0:
        session_phrases += new_phrases[:remaining]

    if not session_phrases:
        raise HTTPException(status_code=404, detail="No phrases due for review")

    # Build distractors: collect words from other phrases for MCQ
    other_phrase_words: list[str] = []
    session_phrase_ids = {p.id for p in session_phrases}
    for phrase in all_phrases:
        if phrase.id not in session_phrase_ids:
            words = [w.strip(".,!?;:'\"()") for w in phrase.text.split() if len(w.strip(".,!?;:'\"()")) > 1]
            other_phrase_words.extend(words)
    random.shuffle(other_phrase_words)
    distractor_pool = list(dict.fromkeys(other_phrase_words))  # deduplicate preserving order

    result = []
    for phrase in session_phrases:
        prog = progress_map.get(phrase.id)
        lesson_stage = prog.lesson_stage if prog else 0
        mistake_words_json = prog.mistake_words_json if prog else "{}"

        blank_word = _pick_blank_word(phrase.text, mistake_words_json)

        # Build MCQ distractors (3 words different from blank_word)
        mcq_distractors = [w for w in distractor_pool if w.lower() != blank_word.lower()][:3]

        result.append({
            "id": phrase.id,
            "text": phrase.text,
            "translation": phrase.translation,
            "translation_en": phrase.translation_en,
            "lesson_stage": lesson_stage,
            "blank_word": blank_word,
            "mcq_distractors": mcq_distractors,
            "next_review": prog.next_review.isoformat() if prog and prog.next_review else None,
        })

    return {"phrases": result}


# ── Cross-program review ─────────────────────────────────────────────────────

@router.get("/phrases/review")
def get_phrase_review_session(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return due phrases across ALL enrolled programs for a review session.

    Collects phrases where next_review <= today (or in-progress) from every
    enrolled program, up to user.phrases_per_session total.
    """
    user = _require_user(authorization, session)

    enrollments = session.exec(
        select(UserPhraseProgramEnrollment).where(
            UserPhraseProgramEnrollment.user_id == user.id
        )
    ).all()
    if not enrollments:
        raise HTTPException(status_code=404, detail="Not enrolled in any program")

    program_ids = [e.program_id for e in enrollments]
    all_phrases = session.exec(
        select(Phrase)
        .where(col(Phrase.program_id).in_(program_ids))
        .order_by(Phrase.position)
    ).all()

    phrase_ids = [p.id for p in all_phrases]
    progress_rows = session.exec(
        select(UserPhraseProgress).where(
            UserPhraseProgress.user_id == user.id,
            col(UserPhraseProgress.phrase_id).in_(phrase_ids),
        )
    ).all()
    progress_map = {r.phrase_id: r for r in progress_rows}

    today = date.today()
    total = user.phrases_per_session if user.phrases_per_session else DEFAULT_PHRASES_PER_SESSION

    due_phrases = []
    for phrase in all_phrases:
        prog = progress_map.get(phrase.id)
        if prog is None:
            continue  # review only: skip unseen phrases
        if prog.next_review is not None and prog.next_review <= today:
            due_phrases.append(phrase)
        elif prog.lesson_stage < 2:
            due_phrases.append(phrase)

    if not due_phrases:
        raise HTTPException(status_code=404, detail="No phrases due for review")

    session_phrases = due_phrases[:total]

    # Build distractors from all phrases not in session
    session_ids = {p.id for p in session_phrases}
    other_words: list[str] = []
    for phrase in all_phrases:
        if phrase.id not in session_ids:
            words = [w.strip(".,!?;:'\"()") for w in phrase.text.split() if len(w.strip(".,!?;:'\"()")) > 1]
            other_words.extend(words)
    random.shuffle(other_words)
    distractor_pool = list(dict.fromkeys(other_words))

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
            "lesson_stage": lesson_stage,
            "blank_word": blank_word,
            "mcq_distractors": mcq_distractors,
            "next_review": prog.next_review.isoformat() if prog and prog.next_review else None,
        })

    return {"phrases": result}


# ── Progress recording ───────────────────────────────────────────────────────

class PhraseProgressUpdate(BaseModel):
    quality: int                          # 0–5, SM-2 quality score
    stage_completed: int                  # which stage was just completed (0, 1, or 2)
    mistake_word: Optional[str] = None    # word the user got wrong in stage 1


@router.post("/phrases/{phrase_id}/progress")
def update_phrase_progress(
    phrase_id: int,
    body: PhraseProgressUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Record the user's result for a phrase exercise.

    - Applies SM-2 to schedule next_review
    - Advances lesson_stage only when quality >= 3 AND stage_completed == current stage
    - Records mistake_word to influence future blank-word selection
    """
    if body.quality not in range(6):
        raise HTTPException(status_code=422, detail="quality must be 0–5")
    if body.stage_completed not in (0, 1, 2):
        raise HTTPException(status_code=422, detail="stage_completed must be 0, 1, or 2")

    user = _require_user(authorization, session)

    phrase = session.get(Phrase, phrase_id)
    if not phrase:
        raise HTTPException(status_code=404, detail="Phrase not found")

    progress = session.exec(
        select(UserPhraseProgress).where(
            UserPhraseProgress.user_id == user.id,
            UserPhraseProgress.phrase_id == phrase_id,
        )
    ).first()

    if progress is None:
        progress = UserPhraseProgress(
            user_id=user.id,
            phrase_id=phrase_id,
            lesson_stage=0,
        )
        session.add(progress)

    # Record mistake word
    if body.mistake_word:
        try:
            mistake_map: dict[str, int] = json.loads(progress.mistake_words_json)
        except Exception:
            mistake_map = {}
        word_key = body.mistake_word.lower().strip(".,!?;:'\"()")
        mistake_map[word_key] = mistake_map.get(word_key, 0) + 1
        progress.mistake_words_json = json.dumps(mistake_map, ensure_ascii=False)
        progress.mistake_count += 1

    # Advance lesson_stage if this stage was completed successfully
    if body.quality >= 3 and body.stage_completed == progress.lesson_stage:
        progress.lesson_stage = min(2, progress.lesson_stage + 1)

    # Apply SM-2
    _apply_sm2_phrase(progress, body.quality)
    progress.last_seen = datetime.now(timezone.utc).replace(tzinfo=None)

    session.add(progress)
    session.commit()

    return {
        "lesson_stage": progress.lesson_stage,
        "next_review": progress.next_review.isoformat() if progress.next_review else None,
        "interval": progress.interval,
    }


@router.get("/me/learned-phrases")
def get_learned_phrases(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all phrases the user has started learning (lesson_stage >= 1),
    ordered by next_review ASC so due phrases appear first."""
    user = _require_user(authorization, session)

    progress_rows = session.exec(
        select(UserPhraseProgress)
        .where(
            UserPhraseProgress.user_id == user.id,
            UserPhraseProgress.lesson_stage >= 2,
        )
        .order_by(UserPhraseProgress.next_review.asc().nulls_first())
    ).all()

    if not progress_rows:
        return []

    phrase_ids = [p.phrase_id for p in progress_rows]
    phrases = session.exec(
        select(Phrase).where(col(Phrase.id).in_(phrase_ids))
    ).all()
    phrase_map = {p.id: p for p in phrases}

    program_ids = list({p.program_id for p in phrase_map.values()})
    programs = session.exec(
        select(PhraseProgram).where(col(PhraseProgram.id).in_(program_ids))
    ).all()
    program_map = {p.id: p for p in programs}

    result = []
    for prog in progress_rows:
        phrase = phrase_map.get(prog.phrase_id)
        if not phrase:
            continue
        program = program_map.get(phrase.program_id)
        result.append({
            "id": phrase.id,
            "text": phrase.text,
            "translation": phrase.translation,
            "translation_en": phrase.translation_en,
            "chapter": phrase.chapter,
            "chapter_title": phrase.chapter_title,
            "program_id": phrase.program_id,
            "program_title": program.title if program else None,
            "lesson_stage": prog.lesson_stage,
            "next_review": prog.next_review.isoformat() if prog.next_review else None,
        })
    return result


# ── User settings (phrases_per_session) ─────────────────────────────────────
# Phrases-per-session is part of the main settings PATCH endpoint in words.py.
# This endpoint exposes it for the phrases settings tab.

@router.get("/me/phrases-settings")
def get_phrases_settings(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the current user's phrases session size."""
    user = _require_user(authorization, session)
    return {"phrases_per_session": user.phrases_per_session}


class PhrasesSettingsUpdate(BaseModel):
    phrases_per_session: int


@router.patch("/me/phrases-settings")
def update_phrases_settings(
    body: PhrasesSettingsUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update the current user's phrases session size."""
    user = _require_user(authorization, session)
    if not (3 <= body.phrases_per_session <= 30):
        raise HTTPException(status_code=422, detail="phrases_per_session must be between 3 and 30")
    user.phrases_per_session = body.phrases_per_session
    session.add(user)
    session.commit()
    return {"phrases_per_session": user.phrases_per_session}
