# Generic practice-test endpoints.
# Supports multiple named tests (e.g. "Lithuanian Constitution", "History", …).
# Admins create/edit/delete tests and their questions via admin endpoints.
# Export/import allow moving tests between environments as JSON.

import json
import random
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, UploadFile, File
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlmodel import Session, select

from auth import require_user as _require_user, try_get_user as _try_get_user
from database import get_session
from models import PracticeTest, PracticeQuestion, PracticeExamResult, PracticeCategory, User

router = APIRouter()


def _require_admin(authorization: Optional[str], session: Session) -> User:
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _valid_option(v: str) -> bool:
    return v in ("a", "b", "c", "d")


# ── User-facing endpoints ────────────────────────────────────────────────────

@router.get("/practice/categories")
def list_categories(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """List all practice categories with published test counts."""
    user = _require_user(authorization, session)
    is_admin = user.is_admin

    categories = session.exec(
        select(PracticeCategory).order_by(PracticeCategory.sort_order, PracticeCategory.id)
    ).all()

    # Count visible tests per category
    all_tests = session.exec(select(PracticeTest)).all()

    def _visible(t: PracticeTest) -> bool:
        if t.status == "published":
            return True
        if is_admin and t.status in ("testing", "draft"):
            return True
        return False

    test_counts: dict[int, int] = {}
    for t in all_tests:
        if _visible(t) and t.category_id is not None:
            test_counts[t.category_id] = test_counts.get(t.category_id, 0) + 1

    return [
        {
            "id": c.id,
            "name_ru": c.name_ru,
            "name_en": c.name_en,
            "description_ru": c.description_ru,
            "sort_order": c.sort_order,
            "test_count": test_counts.get(c.id, 0),
        }
        for c in categories
    ]


@router.get("/practice/categories/{category_id}/tests")
def list_category_tests(
    category_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """List visible tests in a category."""
    user = _require_user(authorization, session)
    is_admin = user.is_admin

    category = session.get(PracticeCategory, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")

    all_tests = session.exec(
        select(PracticeTest)
        .where(PracticeTest.category_id == category_id)
        .order_by(PracticeTest.sort_order, PracticeTest.id)
    ).all()

    def _visible(t: PracticeTest) -> bool:
        if t.status == "published":
            return True
        if is_admin and t.status in ("testing", "draft"):
            return True
        return False

    tests = [t for t in all_tests if _visible(t)]

    active_counts = dict(session.exec(
        select(PracticeQuestion.test_id, func.count(PracticeQuestion.id))
        .where(PracticeQuestion.is_active == True)
        .group_by(PracticeQuestion.test_id)
    ).all())

    return [
        {
            "id": t.id,
            "title_ru": t.title_ru,
            "title_en": t.title_en,
            "description_ru": t.description_ru,
            "description_en": t.description_en,
            "question_count": t.question_count,
            "pass_threshold": t.pass_threshold,
            "is_premium": t.is_premium,
            "active_question_count": active_counts.get(t.id, 0),
        }
        for t in tests
    ]


@router.get("/practice/tests")
def list_active_tests(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """List practice tests visible to the authenticated user.

    Visibility rules:
      published  → everyone
      testing    → admins only
      draft      → only the admin who created it
    """
    user = _require_user(authorization, session)
    is_admin = user.is_admin

    all_tests = session.exec(
        select(PracticeTest).order_by(PracticeTest.sort_order, PracticeTest.id)
    ).all()

    def _visible(t: PracticeTest) -> bool:
        if t.status == "published":
            return True
        if is_admin and t.status == "testing":
            return True
        if is_admin and t.status == "draft" and t.created_by == user.id:
            return True
        return False

    tests = [t for t in all_tests if _visible(t)]

    active_counts = dict(session.exec(
        select(PracticeQuestion.test_id, func.count(PracticeQuestion.id))
        .where(PracticeQuestion.is_active == True)
        .group_by(PracticeQuestion.test_id)
    ).all())
    return [
        {
            "id": t.id,
            "title_ru": t.title_ru,
            "title_en": t.title_en,
            "description_ru": t.description_ru,
            "description_en": t.description_en,
            "question_count": t.question_count,
            "pass_threshold": t.pass_threshold,
            "is_premium": t.is_premium,
            "active_question_count": active_counts.get(t.id, 0),
        }
        for t in tests
    ]


@router.get("/practice/tests/{test_id}/exam")
def get_exam_questions(
    test_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a random set of active questions for the given test."""
    user = _require_user(authorization, session)
    test = session.get(PracticeTest, test_id)
    if not test or (test.status != "published" and not (
        user.is_admin and (test.status == "testing" or (test.status == "draft" and test.created_by == user.id))
    )):
        raise HTTPException(status_code=404, detail="Test not found")
    active = session.exec(
        select(PracticeQuestion)
        .where(PracticeQuestion.test_id == test_id, PracticeQuestion.is_active == True)
    ).all()
    count = min(test.question_count, len(active))
    chosen = random.sample(active, count) if len(active) >= count else list(active)
    return {
        "test": {
            "id": test.id,
            "title_ru": test.title_ru,
            "title_en": test.title_en,
            "pass_threshold": test.pass_threshold,
        },
        "questions": [
            {
                "id": q.id,
                "question_ru": q.question_ru,
                "question_lt": q.question_lt,
                "option_a": q.option_a,
                "option_b": q.option_b,
                "option_c": q.option_c,
                "option_d": q.option_d,
                "correct_option": q.correct_option,
                "category": q.category,
            }
            for q in chosen
        ],
    }


class ExamResultIn(BaseModel):
    score: int
    total: int


@router.post("/practice/tests/{test_id}/results")
def save_exam_result(
    test_id: int,
    body: ExamResultIn,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Save a completed exam result."""
    user = _require_user(authorization, session)
    test = session.get(PracticeTest, test_id)
    if not test:
        raise HTTPException(status_code=404, detail="Test not found")
    if body.total <= 0 or body.score < 0 or body.score > body.total:
        raise HTTPException(status_code=400, detail="Invalid score values")
    session.add(PracticeExamResult(
        user_id=user.id, test_id=test_id, score=body.score, total=body.total
    ))
    session.commit()
    return {"ok": True}


# ── Admin — Categories CRUD ──────────────────────────────────────────────────

@router.get("/admin/practice/categories")
def admin_list_categories(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    _require_admin(authorization, session)
    categories = session.exec(
        select(PracticeCategory).order_by(PracticeCategory.sort_order, PracticeCategory.id)
    ).all()
    total_counts = dict(session.exec(
        select(PracticeTest.category_id, func.count(PracticeTest.id))
        .where(PracticeTest.category_id != None)
        .group_by(PracticeTest.category_id)
    ).all())
    published_counts = dict(session.exec(
        select(PracticeTest.category_id, func.count(PracticeTest.id))
        .where(PracticeTest.category_id != None, PracticeTest.status == "published")
        .group_by(PracticeTest.category_id)
    ).all())
    return [
        {
            "id": c.id,
            "name_ru": c.name_ru,
            "name_en": c.name_en,
            "description_ru": c.description_ru,
            "sort_order": c.sort_order,
            "total_tests": total_counts.get(c.id, 0),
            "published_tests": published_counts.get(c.id, 0),
        }
        for c in categories
    ]


class CategoryIn(BaseModel):
    name_ru: str
    name_en: Optional[str] = None
    description_ru: Optional[str] = None
    sort_order: int = 0


@router.post("/admin/practice/categories")
def admin_create_category(
    body: CategoryIn,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    _require_admin(authorization, session)
    if not body.name_ru.strip():
        raise HTTPException(status_code=400, detail="name_ru required")
    c = PracticeCategory(
        name_ru=body.name_ru.strip(),
        name_en=body.name_en,
        description_ru=body.description_ru,
        sort_order=body.sort_order,
    )
    session.add(c)
    session.commit()
    session.refresh(c)
    return {"id": c.id, "ok": True}


class CategoryUpdate(BaseModel):
    name_ru: Optional[str] = None
    name_en: Optional[str] = None
    description_ru: Optional[str] = None
    sort_order: Optional[int] = None


@router.patch("/admin/practice/categories/{category_id}")
def admin_update_category(
    category_id: int,
    body: CategoryUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    _require_admin(authorization, session)
    c = session.get(PracticeCategory, category_id)
    if not c:
        raise HTTPException(status_code=404, detail="Category not found")
    if body.name_ru is not None:
        c.name_ru = body.name_ru.strip()
    if body.name_en is not None:
        c.name_en = body.name_en
    if body.description_ru is not None:
        c.description_ru = body.description_ru
    if body.sort_order is not None:
        c.sort_order = body.sort_order
    session.add(c)
    session.commit()
    return {"ok": True}


@router.delete("/admin/practice/categories/{category_id}")
def admin_delete_category(
    category_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    _require_admin(authorization, session)
    c = session.get(PracticeCategory, category_id)
    if not c:
        raise HTTPException(status_code=404, detail="Category not found")
    # Unlink tests from this category before deleting
    tests = session.exec(
        select(PracticeTest).where(PracticeTest.category_id == category_id)
    ).all()
    for t in tests:
        t.category_id = None
        session.add(t)
    session.delete(c)
    session.commit()
    return {"ok": True}


# ── Admin — Tests CRUD ───────────────────────────────────────────────────────

@router.get("/admin/practice/categories/{category_id}/tests")
def admin_list_category_tests(
    category_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """List all tests in a category (admin)."""
    _require_admin(authorization, session)
    if not session.get(PracticeCategory, category_id):
        raise HTTPException(status_code=404, detail="Category not found")
    tests = session.exec(
        select(PracticeTest)
        .where(PracticeTest.category_id == category_id)
        .order_by(PracticeTest.sort_order, PracticeTest.id)
    ).all()
    total_counts = dict(session.exec(
        select(PracticeQuestion.test_id, func.count(PracticeQuestion.id))
        .group_by(PracticeQuestion.test_id)
    ).all())
    active_counts = dict(session.exec(
        select(PracticeQuestion.test_id, func.count(PracticeQuestion.id))
        .where(PracticeQuestion.is_active == True)
        .group_by(PracticeQuestion.test_id)
    ).all())
    return [
        {
            "id": t.id,
            "category_id": t.category_id,
            "title_ru": t.title_ru,
            "title_en": t.title_en,
            "description_ru": t.description_ru,
            "description_en": t.description_en,
            "question_count": t.question_count,
            "pass_threshold": t.pass_threshold,
            "status": t.status,
            "is_premium": t.is_premium,
            "created_by": t.created_by,
            "sort_order": t.sort_order,
            "total_questions": total_counts.get(t.id, 0),
            "active_questions": active_counts.get(t.id, 0),
        }
        for t in tests
    ]


@router.get("/admin/practice/tests")
def admin_list_tests(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """List all practice tests (admin)."""
    _require_admin(authorization, session)
    tests = session.exec(
        select(PracticeTest).order_by(PracticeTest.sort_order, PracticeTest.id)
    ).all()
    total_counts = dict(session.exec(
        select(PracticeQuestion.test_id, func.count(PracticeQuestion.id))
        .group_by(PracticeQuestion.test_id)
    ).all())
    active_counts = dict(session.exec(
        select(PracticeQuestion.test_id, func.count(PracticeQuestion.id))
        .where(PracticeQuestion.is_active == True)
        .group_by(PracticeQuestion.test_id)
    ).all())
    return [
        {
            "id": t.id,
            "category_id": t.category_id,
            "title_ru": t.title_ru,
            "title_en": t.title_en,
            "description_ru": t.description_ru,
            "description_en": t.description_en,
            "question_count": t.question_count,
            "pass_threshold": t.pass_threshold,
            "status": t.status,
            "is_premium": t.is_premium,
            "created_by": t.created_by,
            "sort_order": t.sort_order,
            "total_questions": total_counts.get(t.id, 0),
            "active_questions": active_counts.get(t.id, 0),
        }
        for t in tests
    ]


class TestIn(BaseModel):
    title_ru: str
    title_en: Optional[str] = None
    description_ru: Optional[str] = None
    description_en: Optional[str] = None
    question_count: int = 20
    pass_threshold: float = 0.75
    status: str = "draft"
    is_premium: bool = False
    category_id: Optional[int] = None
    sort_order: int = 0


@router.post("/admin/practice/tests")
def admin_create_test(
    body: TestIn,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    admin = _require_admin(authorization, session)
    if not body.title_ru.strip():
        raise HTTPException(status_code=400, detail="title_ru required")
    if body.status not in ("draft", "testing", "published"):
        raise HTTPException(status_code=400, detail="status must be draft, testing, or published")
    t = PracticeTest(
        title_ru=body.title_ru.strip(),
        title_en=body.title_en,
        description_ru=body.description_ru,
        description_en=body.description_en,
        question_count=body.question_count,
        pass_threshold=body.pass_threshold,
        status=body.status,
        is_premium=body.is_premium,
        category_id=body.category_id,
        created_by=admin.id,
        sort_order=body.sort_order,
    )
    session.add(t)
    session.commit()
    session.refresh(t)
    return {"id": t.id, "ok": True}


class TestUpdate(BaseModel):
    title_ru: Optional[str] = None
    title_en: Optional[str] = None
    description_ru: Optional[str] = None
    description_en: Optional[str] = None
    question_count: Optional[int] = None
    pass_threshold: Optional[float] = None
    status: Optional[str] = None
    is_premium: Optional[bool] = None
    category_id: Optional[int] = None
    sort_order: Optional[int] = None


@router.patch("/admin/practice/tests/{test_id}")
def admin_update_test(
    test_id: int,
    body: TestUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    _require_admin(authorization, session)
    t = session.get(PracticeTest, test_id)
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")
    if body.title_ru is not None:
        t.title_ru = body.title_ru.strip()
    if body.title_en is not None:
        t.title_en = body.title_en
    if body.description_ru is not None:
        t.description_ru = body.description_ru
    if body.description_en is not None:
        t.description_en = body.description_en
    if body.question_count is not None:
        t.question_count = body.question_count
    if body.pass_threshold is not None:
        t.pass_threshold = body.pass_threshold
    if body.status is not None:
        if body.status not in ("draft", "testing", "published"):
            raise HTTPException(status_code=400, detail="status must be draft, testing, or published")
        t.status = body.status
    if body.sort_order is not None:
        t.sort_order = body.sort_order
    if body.is_premium is not None:
        t.is_premium = body.is_premium
    if body.category_id is not None:
        t.category_id = body.category_id
    session.add(t)
    session.commit()
    return {"ok": True}


@router.delete("/admin/practice/tests/{test_id}")
def admin_delete_test(
    test_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    _require_admin(authorization, session)
    t = session.get(PracticeTest, test_id)
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")
    # Delete all questions in this test first
    questions = session.exec(
        select(PracticeQuestion).where(PracticeQuestion.test_id == test_id)
    ).all()
    for q in questions:
        session.delete(q)
    session.delete(t)
    session.commit()
    return {"ok": True}


# ── Admin — Questions CRUD ───────────────────────────────────────────────────

@router.get("/admin/practice/tests/{test_id}/questions")
def admin_list_questions(
    test_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    _require_admin(authorization, session)
    questions = session.exec(
        select(PracticeQuestion)
        .where(PracticeQuestion.test_id == test_id)
        .order_by(PracticeQuestion.sort_order, PracticeQuestion.id)
    ).all()
    return [
        {
            "id": q.id,
            "question_ru": q.question_ru,
            "question_lt": q.question_lt,
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
    question_lt: Optional[str] = None
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str
    category: Optional[str] = None
    is_active: bool = True
    sort_order: int = 0


@router.post("/admin/practice/tests/{test_id}/questions")
def admin_create_question(
    test_id: int,
    body: QuestionIn,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    _require_admin(authorization, session)
    if not session.get(PracticeTest, test_id):
        raise HTTPException(status_code=404, detail="Test not found")
    if not _valid_option(body.correct_option):
        raise HTTPException(status_code=400, detail="correct_option must be a/b/c/d")
    q = PracticeQuestion(
        test_id=test_id,
        question_ru=body.question_ru.strip(),
        question_lt=body.question_lt.strip() if body.question_lt else None,
        option_a=body.option_a.strip(),
        option_b=body.option_b.strip(),
        option_c=body.option_c.strip(),
        option_d=body.option_d.strip(),
        correct_option=body.correct_option,
        category=body.category or None,
        is_active=body.is_active,
        sort_order=body.sort_order,
    )
    session.add(q)
    session.commit()
    session.refresh(q)
    return {"id": q.id, "ok": True}


class QuestionUpdate(BaseModel):
    question_ru: Optional[str] = None
    question_lt: Optional[str] = None
    option_a: Optional[str] = None
    option_b: Optional[str] = None
    option_c: Optional[str] = None
    option_d: Optional[str] = None
    correct_option: Optional[str] = None
    category: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


@router.patch("/admin/practice/questions/{question_id}")
def admin_update_question(
    question_id: int,
    body: QuestionUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    _require_admin(authorization, session)
    q = session.get(PracticeQuestion, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    if body.correct_option is not None and not _valid_option(body.correct_option):
        raise HTTPException(status_code=400, detail="correct_option must be a/b/c/d")
    for field in ("question_ru", "question_lt", "option_a", "option_b", "option_c", "option_d",
                  "correct_option", "category", "is_active", "sort_order"):
        val = getattr(body, field)
        if val is not None:
            setattr(q, field, val.strip() if isinstance(val, str) else val)
    session.add(q)
    session.commit()
    return {"ok": True}


@router.delete("/admin/practice/questions/{question_id}")
def admin_delete_question(
    question_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    _require_admin(authorization, session)
    q = session.get(PracticeQuestion, question_id)
    if not q:
        raise HTTPException(status_code=404, detail="Question not found")
    session.delete(q)
    session.commit()
    return {"ok": True}


# ── Admin — Export / Import ──────────────────────────────────────────────────

@router.get("/admin/practice/tests/{test_id}/export")
def admin_export_test(
    test_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Export a test and all its questions as a JSON file."""
    _require_admin(authorization, session)
    t = session.get(PracticeTest, test_id)
    if not t:
        raise HTTPException(status_code=404, detail="Test not found")
    questions = session.exec(
        select(PracticeQuestion)
        .where(PracticeQuestion.test_id == test_id)
        .order_by(PracticeQuestion.sort_order, PracticeQuestion.id)
    ).all()
    payload = {
        "title_ru": t.title_ru,
        "title_en": t.title_en,
        "description_ru": t.description_ru,
        "description_en": t.description_en,
        "question_count": t.question_count,
        "pass_threshold": t.pass_threshold,
        "questions": [
            {
                "question_ru": q.question_ru,
                "question_lt": q.question_lt,
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
        ],
    }
    slug = t.title_ru[:30].replace(" ", "_").lower()
    return JSONResponse(
        content=payload,
        headers={"Content-Disposition": f'attachment; filename="practice_{slug}.json"'},
    )


@router.post("/admin/practice/tests/import")
async def admin_import_test(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Import a test from a JSON file. Creates a new test with all questions."""
    admin = _require_admin(authorization, session)
    try:
        raw = await file.read()
        data = json.loads(raw)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    title_ru = data.get("title_ru", "").strip()
    if not title_ru:
        raise HTTPException(status_code=400, detail="title_ru is required in JSON")

    t = PracticeTest(
        title_ru=title_ru,
        title_en=data.get("title_en"),
        description_ru=data.get("description_ru"),
        description_en=data.get("description_en"),
        question_count=int(data.get("question_count", 20)),
        pass_threshold=float(data.get("pass_threshold", 0.75)),
        status="draft",
        created_by=admin.id,
        sort_order=0,
    )
    session.add(t)
    session.flush()  # get t.id before adding questions

    imported = 0
    for i, item in enumerate(data.get("questions", [])):
        opt = item.get("correct_option", "")
        if not _valid_option(opt):
            continue
        q = PracticeQuestion(
            test_id=t.id,
            question_ru=str(item.get("question_ru", "")).strip(),
            question_lt=str(item["question_lt"]).strip() if item.get("question_lt") else None,
            option_a=str(item.get("option_a", "")).strip(),
            option_b=str(item.get("option_b", "")).strip(),
            option_c=str(item.get("option_c", "")).strip(),
            option_d=str(item.get("option_d", "")).strip(),
            correct_option=opt,
            category=item.get("category") or None,
            is_active=bool(item.get("is_active", True)),
            sort_order=int(item.get("sort_order", i)),
        )
        session.add(q)
        imported += 1

    session.commit()
    return {"ok": True, "test_id": t.id, "imported_questions": imported}
