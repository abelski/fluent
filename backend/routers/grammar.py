# Grammar lesson endpoints.
# This router is intentionally thin — all content logic lives in grammar_service.py.

import json
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from auth import require_user as _require_user, try_get_user as _try_get_user
from data.grammar.lessons import CASE_INFO as _CASE_INFO
from database import get_session
from grammar_service import get_lessons, get_lesson_tasks, get_verb_lessons, get_verb_lesson_tasks
from models import GrammarLessonResult, GrammarProgram, UserGrammarProgram
from quota import quota_check_and_increment as _quota_check_and_increment

_SEED_PROGRAMS = [
    {
        "title": "Литовские падежи",
        "title_en": "Lithuanian Cases",
        "description": "Все грамматические падежи литовского языка: единственное и множественное число.",
        "difficulty": 1,
    },
    {
        "title": "Числительные",
        "title_en": "Numbers",
        "description": "Количественные и порядковые числительные: согласование с существительными по падежам.",
        "difficulty": 1,
    },
]


def _ensure_seed(session: Session) -> None:
    existing_titles = {p.title for p in session.exec(select(GrammarProgram)).all()}
    for seed in _SEED_PROGRAMS:
        if seed["title"] not in existing_titles:
            session.add(GrammarProgram(**seed))
    # verb_cases exercises are hidden — too confusing without more context
    for prog in session.exec(
        select(GrammarProgram).where(GrammarProgram.program_type == "verb_cases")
    ).all():
        if prog.is_public:
            prog.is_public = False
    session.commit()

router = APIRouter()


@router.get("/grammar/lessons")
def list_lessons(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all lessons with metadata.

    Includes is_locked and best_score_pct per lesson when user is authenticated.
    Locking rule: lesson N is locked until lesson N-1 best score > 75%.
    Unauthenticated users see all lessons unlocked (no progression tracking).
    """
    user = _try_get_user(authorization, session)
    is_admin = user is not None and user.is_admin
    lessons = get_lessons(session, is_admin=is_admin)

    best_scores: dict[int, float] = {}

    user_authenticated = user is not None
    if user:
        results = session.exec(
            select(GrammarLessonResult).where(GrammarLessonResult.user_id == user.id)
        ).all()
        for r in results:
            pct = r.score / r.total if r.total > 0 else 0.0
            if r.lesson_id not in best_scores or pct > best_scores[r.lesson_id]:
                best_scores[r.lesson_id] = pct

    # Unlock the first lesson of each enrolled program so programs can be
    # started independently without completing all preceding programs first.
    first_program_lesson_ids: set[int] = set()
    if user:
        case_to_group = {k: v[1] for k, v in _CASE_INFO.items()}
        enrollments = session.exec(
            select(UserGrammarProgram).where(UserGrammarProgram.user_id == user.id)
        ).all()
        if enrollments:
            enrolled_ids = {e.program_id for e in enrollments}
            enrolled_programs = session.exec(
                select(GrammarProgram).where(GrammarProgram.id.in_(enrolled_ids))
            ).all()
            for prog in enrolled_programs:
                if not prog.lesson_filter:
                    if lessons:
                        first_program_lesson_ids.add(lessons[0]["id"])
                else:
                    try:
                        allowed = set(json.loads(prog.lesson_filter))
                        for lesson in lessons:
                            if all(case_to_group.get(c, "") in allowed for c in lesson["cases"]):
                                first_program_lesson_ids.add(lesson["id"])
                                break
                    except Exception:
                        pass

    for i, lesson in enumerate(lessons):
        lesson["best_score_pct"] = best_scores.get(lesson["id"])
        if not user_authenticated or i == 0 or lesson["id"] in first_program_lesson_ids:
            lesson["is_locked"] = False
        else:
            prev_id = lessons[i - 1]["id"]
            lesson["is_locked"] = best_scores.get(prev_id, 0.0) <= 0.75

    return lessons


@router.get("/grammar/lessons/{lesson_id}/tasks")
def lesson_tasks(
    lesson_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a freshly generated set of tasks for the given lesson.

    Tasks are randomized on every call so students get variety each session.
    Counts against the daily session quota for non-premium users.
    Returns 404 if the lesson_id doesn't match any entry in LESSON_CONFIG.
    """
    user = _try_get_user(authorization, session)
    if user:
        _quota_check_and_increment(user, session)
    tasks = get_lesson_tasks(lesson_id, session)
    if tasks is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return tasks


class LessonResultIn(BaseModel):
    score: int
    total: int


@router.post("/grammar/lessons/{lesson_id}/results")
def save_lesson_result(
    lesson_id: int,
    body: LessonResultIn,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Save the result of a completed lesson attempt.

    Validates score <= total and total > 0. passed=True when score/total > 0.75.
    """
    user = _require_user(authorization, session)
    if body.total <= 0 or body.score < 0 or body.score > body.total:
        raise HTTPException(status_code=400, detail="Invalid score values")
    passed = body.score / body.total > 0.75
    result = GrammarLessonResult(
        user_id=user.id,
        lesson_id=lesson_id,
        score=body.score,
        total=body.total,
        passed=passed,
    )
    session.add(result)
    session.commit()
    return {"ok": True, "passed": passed}


@router.get("/grammar/progress")
def get_progress(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the best score ratio per lesson for the authenticated user.

    Response: { lesson_id: best_score_pct, ... }
    """
    user = _require_user(authorization, session)
    results = session.exec(
        select(GrammarLessonResult).where(GrammarLessonResult.user_id == user.id)
    ).all()
    best: dict[int, float] = {}
    for r in results:
        pct = r.score / r.total if r.total > 0 else 0.0
        if r.lesson_id not in best or pct > best[r.lesson_id]:
            best[r.lesson_id] = pct
    return best


@router.get("/grammar-programs")
def list_grammar_programs(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all public grammar programs with enrollment status for authenticated users."""
    _ensure_seed(session)
    user = _try_get_user(authorization, session)
    programs = session.exec(
        select(GrammarProgram).where(GrammarProgram.is_public == True)
    ).all()
    enrolled_ids: set[int] = set()
    if user:
        enrollments = session.exec(
            select(UserGrammarProgram).where(UserGrammarProgram.user_id == user.id)
        ).all()
        enrolled_ids = {e.program_id for e in enrollments}
    return [
        {
            "id": p.id,
            "title": p.title,
            "title_en": p.title_en,
            "description": p.description,
            "difficulty": p.difficulty,
            "enrolled": p.id in enrolled_ids,
            "lesson_filter": p.lesson_filter,
            "program_type": p.program_type,
        }
        for p in programs
    ]


@router.post("/me/grammar-programs/{program_id}")
def enroll_grammar_program(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Enroll the authenticated user in a grammar program (idempotent)."""
    user = _require_user(authorization, session)
    program = session.get(GrammarProgram, program_id)
    if not program or not program.is_public:
        raise HTTPException(status_code=404, detail="Program not found")
    existing = session.exec(
        select(UserGrammarProgram).where(
            UserGrammarProgram.user_id == user.id,
            UserGrammarProgram.program_id == program_id,
        )
    ).first()
    if not existing:
        session.add(UserGrammarProgram(user_id=user.id, program_id=program_id))
        session.commit()
    return {"ok": True}


@router.delete("/me/grammar-programs/{program_id}")
def unenroll_grammar_program(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Unenroll the authenticated user from a grammar program (idempotent)."""
    user = _require_user(authorization, session)
    enrollment = session.exec(
        select(UserGrammarProgram).where(
            UserGrammarProgram.user_id == user.id,
            UserGrammarProgram.program_id == program_id,
        )
    ).first()
    if enrollment:
        session.delete(enrollment)
        session.commit()
    return {"ok": True}


# ── Verb lesson endpoints ─────────────────────────────────────────────────────

@router.get("/grammar/verb-lessons")
def list_verb_lessons(
    program_type: str = "verbs",
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return verb lesson metadata for the given program type.

    program_type: 'verbs' (conjugation) or 'verb_cases' (case governance).
    Includes best_score_pct and is_locked per lesson when user is authenticated.
    """
    user = _try_get_user(authorization, session)
    lessons = get_verb_lessons(session, program_type=program_type)

    best_scores: dict[int, float] = {}
    if user:
        results = session.exec(
            select(GrammarLessonResult).where(GrammarLessonResult.user_id == user.id)
        ).all()
        for r in results:
            pct = r.score / r.total if r.total > 0 else 0.0
            if r.lesson_id not in best_scores or pct > best_scores[r.lesson_id]:
                best_scores[r.lesson_id] = pct

    for i, lesson in enumerate(lessons):
        lesson["best_score_pct"] = best_scores.get(lesson["id"])
        if user is None or i == 0:
            lesson["is_locked"] = False
        else:
            prev_id = lessons[i - 1]["id"]
            lesson["is_locked"] = best_scores.get(prev_id, 0.0) <= 0.75

    return lessons


@router.get("/grammar/verb-lessons/{lesson_id}/tasks")
def verb_lesson_tasks(
    lesson_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return randomized verb tasks for the given lesson.

    Counts against the daily session quota for non-premium users.
    Returns 404 if lesson_id is not in verb_lessons.json.
    """
    user = _try_get_user(authorization, session)
    if user:
        _quota_check_and_increment(user, session)
    tasks = get_verb_lesson_tasks(lesson_id, session)
    if tasks is None:
        raise HTTPException(status_code=404, detail="Verb lesson not found")
    return tasks


@router.post("/grammar/verb-lessons/{lesson_id}/results")
def save_verb_lesson_result(
    lesson_id: int,
    body: LessonResultIn,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Save verb lesson score. Reuses GrammarLessonResult — no new model needed."""
    user = _require_user(authorization, session)
    if body.total <= 0 or body.score < 0 or body.score > body.total:
        raise HTTPException(status_code=400, detail="Invalid score values")
    passed = body.score / body.total > 0.75
    result = GrammarLessonResult(
        user_id=user.id,
        lesson_id=lesson_id,
        score=body.score,
        total=body.total,
        passed=passed,
    )
    session.add(result)
    session.commit()
    return {"ok": True, "passed": passed}
