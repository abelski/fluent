# Grammar lesson endpoints.
# This router is intentionally thin — all content logic lives in grammar_service.py.

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from auth import require_user as _require_user, try_get_user as _try_get_user
from database import get_session
from grammar_service import get_lessons, get_lesson_tasks
from models import GrammarLessonResult

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
    lessons = get_lessons()

    best_scores: dict[int, float] = {}

    user = _try_get_user(authorization, session)
    user_authenticated = user is not None
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
        if not user_authenticated or i == 0:
            lesson["is_locked"] = False
        else:
            prev_id = lessons[i - 1]["id"]
            lesson["is_locked"] = best_scores.get(prev_id, 0.0) <= 0.75

    return lessons


@router.get("/grammar/lessons/{lesson_id}/tasks")
def lesson_tasks(lesson_id: int, session: Session = Depends(get_session)):
    """Return a freshly generated set of tasks for the given lesson.

    Tasks are randomized on every call so students get variety each session.
    Returns 404 if the lesson_id doesn't match any entry in LESSON_CONFIG.
    """
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
