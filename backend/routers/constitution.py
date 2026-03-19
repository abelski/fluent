# Constitution exam endpoints — practice and admin management.
# Public: GET /api/practice/constitution/exam (requires auth)
#         POST /api/practice/constitution/results (requires auth)
# Admin:  full CRUD for questions

import random
from typing import Optional, List

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from auth import require_user as _require_user
from database import get_session
from models import ConstitutionQuestion, ConstitutionExamResult, User

router = APIRouter()

EXAM_QUESTION_COUNT = 20


def _require_admin(authorization: Optional[str], session: Session) -> User:
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


# ── Practice endpoints ──────────────────────────────────────────────────────

@router.get("/practice/constitution/exam")
def get_exam_questions(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a random set of active constitution questions for an exam.
    Requires authentication. Returns up to EXAM_QUESTION_COUNT questions."""
    _require_user(authorization, session)
    active = session.exec(
        select(ConstitutionQuestion).where(ConstitutionQuestion.is_active == True)
    ).all()
    count = min(EXAM_QUESTION_COUNT, len(active))
    chosen = random.sample(active, count) if len(active) >= count else active[:]
    return [
        {
            "id": q.id,
            "question_ru": q.question_ru,
            "option_a": q.option_a,
            "option_b": q.option_b,
            "option_c": q.option_c,
            "option_d": q.option_d,
            "correct_option": q.correct_option,
            "category": q.category,
        }
        for q in chosen
    ]


class ExamResultIn(BaseModel):
    score: int
    total: int


@router.post("/practice/constitution/results")
def save_exam_result(
    body: ExamResultIn,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Save a completed constitution exam result for the authenticated user."""
    user = _require_user(authorization, session)
    if body.total <= 0 or body.score < 0 or body.score > body.total:
        raise HTTPException(status_code=400, detail="Invalid score values")
    result = ConstitutionExamResult(
        user_id=user.id,
        score=body.score,
        total=body.total,
    )
    session.add(result)
    session.commit()
    return {"ok": True}


# ── Admin endpoints ─────────────────────────────────────────────────────────

@router.get("/admin/constitution/questions")
def list_questions(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """List all constitution questions (admin only)."""
    _require_admin(authorization, session)
    questions = session.exec(
        select(ConstitutionQuestion).order_by(ConstitutionQuestion.sort_order, ConstitutionQuestion.id)
    ).all()
    return [
        {
            "id": q.id,
            "question_ru": q.question_ru,
            "option_a": q.option_a,
            "option_b": q.option_b,
            "option_c": q.option_c,
            "option_d": q.option_d,
            "correct_option": q.correct_option,
            "category": q.category,
            "is_active": q.is_active,
            "sort_order": q.sort_order,
        }
        for q in questions
    ]


class QuestionIn(BaseModel):
    question_ru: str
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str  # 'a' | 'b' | 'c' | 'd'
    category: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


@router.post("/admin/constitution/questions")
def create_question(
    body: QuestionIn,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Create a new constitution question (admin only)."""
    _require_admin(authorization, session)
    if body.correct_option not in ("a", "b", "c", "d"):
        raise HTTPException(status_code=400, detail="correct_option must be a, b, c, or d")
    q = ConstitutionQuestion(
        question_ru=body.question_ru.strip(),
        option_a=body.option_a.strip(),
        option_b=body.option_b.strip(),
        option_c=body.option_c.strip(),
        option_d=body.option_d.strip(),
        correct_option=body.correct_option,
        category=body.category,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    session.add(q)
    session.commit()
    session.refresh(q)
    return {"id": q.id, "ok": True}


class QuestionUpdate(BaseModel):
    question_ru: Optional[str] = None
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    correct_option: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


@router.patch("/admin/constitution/questions/{question_id}")
def update_question(
    question_id: int,
    body: QuestionUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update a constitution question (admin only)."""
    _require_admin(authorization, session)
    q = session.get(ConstitutionQuestion, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    if body.correct_option is not None and body.correct_option not in ("a", "b", "c", "d"):
        raise HTTPException(status_code=400, detail="correct_option must be a, b, c, or d")
    if body.question_ru is not None:
        q.question_ru = body.question_ru.strip()
    if body.option_a is not None:
        q.option_a = body.option_a.strip()
    if body.option_b is not None:
        q.option_b = body.option_b.strip()
    if body.option_c is not None:
        q.option_c = body.option_c.strip()
    if body.option_d is not None:
        q.option_d = body.option_d.strip()
    if body.correct_option is not None:
        q.correct_option = body.correct_option
    if body.category is not None:
        q.category = body.category
    if body.is_active is not None:
        q.is_active = body.is_active
    if body.sort_order is not None:
        q.sort_order = body.sort_order
    session.add(q)
    session.commit()
    return {"ok": True}


@router.delete("/admin/constitution/questions/{question_id}")
def delete_question(
    question_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Delete a constitution question permanently (admin only)."""
    _require_admin(authorization, session)
    q = session.get(ConstitutionQuestion, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    session.delete(q)
    session.commit()
    return {"ok": True}
