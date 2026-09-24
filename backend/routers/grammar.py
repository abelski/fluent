# Grammar lesson endpoints.
# This router is intentionally thin — all content logic lives in grammar_service.py.

import json
import math
import random
from types import SimpleNamespace
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

import cache
from auth import require_user as _require_user, try_get_user as _try_get_user
from data.grammar.lessons import CASE_INFO as _CASE_INFO
from database import get_session
from grammar_service import (
    REMIND_LESSON_ID,
    REMIND_TASK_COUNT,
    get_lessons,
    get_lesson_tasks,
    get_verb_lessons,
    get_verb_lesson_tasks,
)
from models import GrammarLessonResult, GrammarProgram, User, UserGrammarProgram
from quota import is_premium_active as _is_premium_active, quota_check_and_increment as _quota_check_and_increment

_SEED_PROGRAMS = [
    {
        "title": "Литовские падежи",
        "title_en": "Lithuanian Cases",
        "description": "Все грамматические падежи литовского языка: единственное и множественное число.",
        "description_en": "All the grammatical cases of Lithuanian, in the singular and the plural.",
        "difficulty": 1,
    },
    {
        "title": "Числительные",
        "title_en": "Numbers",
        "description": "Количественные и порядковые числительные: согласование с существительными по падежам.",
        "description_en": "Cardinal and ordinal numbers: agreement with nouns in every case.",
        "difficulty": 1,
    },
]


def _grammar_programs(session: Session) -> list[SimpleNamespace]:
    """All grammar programs as plain rows — cached (#24, row 4).

    `is_public` filtering happens per request on this pool.
    """
    return cache.get_or_load(
        ("grammar_programs",),
        lambda: [
            SimpleNamespace(id=p.id, title=p.title, title_en=p.title_en,
                            description=p.description, description_en=p.description_en,
                            difficulty=p.difficulty,
                            is_public=p.is_public, lesson_filter=p.lesson_filter,
                            program_type=p.program_type)
            for p in session.exec(select(GrammarProgram)).all()
        ],
        tags={"grammar_program"},
    )


def _ensure_seed(session: Session) -> None:
    """Idempotent bootstrap. Reads the cached pool first so the steady state — seeds
    present, verb_cases already hidden — costs no DB round trip at all."""
    programs = _grammar_programs(session)
    existing_titles = {p.title for p in programs}
    missing = [s for s in _SEED_PROGRAMS if s["title"] not in existing_titles]
    # verb_cases exercises are hidden — too confusing without more context
    exposed_verb_cases = [p.id for p in programs if p.program_type == "verb_cases" and p.is_public]
    if not missing and not exposed_verb_cases:
        return
    for seed in missing:
        session.add(GrammarProgram(**seed))
    for prog in session.exec(
        select(GrammarProgram).where(GrammarProgram.id.in_(exposed_verb_cases))
    ).all():
        prog.is_public = False
    session.commit()   # the flush evicts `grammar_program`, so the pool reloads


router = APIRouter()


def _lock_bypassed(user: Optional[User]) -> bool:
    """Premium (active) and admin users are never subject to the sequential lesson lock.

    Same premium gate as personal word lists (`routers/word_lists.py`): skipping the
    lesson order is a paid feature, so admins get it too for support/debugging.
    """
    return user is not None and (user.is_admin or _is_premium_active(user))


def _annotate_lesson_progress(lessons: list[dict], user: Optional[User], session: Session) -> list[dict]:
    """Attach `best_score_pct` and `is_locked` to each lesson dict, in place.

    Locking rule: lesson N is locked until lesson N-1's best score > 75%. The first
    lesson overall — and the first lesson of every program the user is enrolled in —
    is always unlocked. Unauthenticated users see everything unlocked (no progression).
    Premium/admin users bypass the lock entirely (`_lock_bypassed`).

    Extracted from GET /grammar/lessons so the combined continue-session endpoint can
    widen its candidate pool to unlocked-but-unpassed lessons using this exact rule
    instead of reimplementing it.
    """
    best_scores: dict[int, float] = {}
    bypass = _lock_bypassed(user)

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
        enrolled_ids = cache.enrollment_ids(
            session, UserGrammarProgram, UserGrammarProgram.program_id, user.id
        )
        if enrolled_ids:
            enrolled_programs = [p for p in _grammar_programs(session) if p.id in enrolled_ids]
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
        if not user_authenticated or bypass or i == 0 or lesson["id"] in first_program_lesson_ids:
            lesson["is_locked"] = False
        else:
            prev_id = lessons[i - 1]["id"]
            lesson["is_locked"] = best_scores.get(prev_id, 0.0) <= 0.75

    return lessons


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
    return _annotate_lesson_progress(lessons, user, session)


@router.get("/grammar/lessons/{lesson_id}/tasks")
def lesson_tasks(
    lesson_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a freshly generated set of tasks for the given lesson.

    Tasks are randomized on every call so students get variety each session.
    Counts against the daily session quota for non-premium users.
    Returns 403 if the lesson is still locked for this (free) user — the lock used to
    be list-metadata only, i.e. cosmetic; premium/admin skip it (`_lock_bypassed`).
    Returns 404 if the lesson_id doesn't match any entry in LESSON_CONFIG.
    """
    user = _try_get_user(authorization, session)
    # Lock check runs BEFORE the quota increment so a rejected attempt costs nothing.
    if user and not _lock_bypassed(user):
        annotated = _annotate_lesson_progress(
            get_lessons(session, is_admin=False), user, session
        )
        current = next((l for l in annotated if l["id"] == lesson_id), None)
        if current and current["is_locked"]:
            raise HTTPException(
                status_code=403,
                detail="Lesson is locked. Finish the previous lesson or upgrade to Premium.",
            )
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
        if r.lesson_id == REMIND_LESSON_ID:
            continue  # #26 — the remind sentinel is not a real lesson
        pct = r.score / r.total if r.total > 0 else 0.0
        if r.lesson_id not in best or pct > best[r.lesson_id]:
            best[r.lesson_id] = pct
    return best


def _program_lesson_ids(program: SimpleNamespace, session: Session) -> list[int]:
    """Lesson ids visible for this program — mirrors the frontend's own
    `filterLessonsForProgram` (grammar/page.tsx) so remind's eligibility matches
    exactly what the lesson list shows for this program."""
    if program.program_type in ("verbs", "verb_cases"):
        return [l["id"] for l in get_verb_lessons(session, program_type=program.program_type)]
    lessons = get_lessons(session, is_admin=False)
    if not program.lesson_filter:
        return [l["id"] for l in lessons]
    try:
        allowed = set(json.loads(program.lesson_filter))
    except Exception:
        return [l["id"] for l in lessons]
    case_to_group = {k: v[1] for k, v in _CASE_INFO.items()}
    return [
        l["id"] for l in lessons
        if all(case_to_group.get(c, "") in allowed for c in l["cases"])
    ]


@router.get("/grammar/remind/tasks")
def remind_tasks(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """«Напомни что я мог забыть» (#26) — a mixed run built from every «Повторение»
    (practice) lesson the user has already passed, in programs they're enrolled in.

    404 (no session charged) when nothing is eligible; otherwise a daily session is
    spent like any other lesson. The result is saved by the caller against the
    REMIND_LESSON_ID sentinel via the existing POST /grammar/lessons/0/results.
    """
    user = _require_user(authorization, session)

    enrolled_ids = cache.enrollment_ids(
        session, UserGrammarProgram, UserGrammarProgram.program_id, user.id
    )
    programs = [p for p in _grammar_programs(session) if p.id in enrolled_ids]

    passed_ids: set[int] = set(session.exec(
        select(GrammarLessonResult.lesson_id)
        .where(
            GrammarLessonResult.user_id == user.id,
            GrammarLessonResult.passed == True,  # noqa: E712
        )
        .distinct()
    ).all())

    all_lessons = (
        get_lessons(session, is_admin=False)
        + get_verb_lessons(session, program_type="verbs")
        + get_verb_lessons(session, program_type="verb_cases")
    )
    lesson_level = {l["id"]: l.get("level") for l in all_lessons}

    eligible_ids: set[int] = set()
    for program in programs:
        for lid in _program_lesson_ids(program, session):
            if lid in passed_ids and lesson_level.get(lid) == "practice":
                eligible_ids.add(lid)

    if not eligible_ids:
        # Before quota — a user with nothing eligible pays nothing for asking.
        raise HTTPException(status_code=404, detail={"code": "no_passed_practice"})

    _quota_check_and_increment(user, session)

    eligible = list(eligible_ids)
    random.shuffle(eligible)
    chosen = eligible[:REMIND_TASK_COUNT]
    per_lesson = math.ceil(REMIND_TASK_COUNT / len(chosen))

    pool: list[dict] = []
    for lid in chosen:
        tasks = (get_verb_lesson_tasks(lid, session) if lid >= 200 else get_lesson_tasks(lid, session)) or []
        if tasks:
            pool.extend(random.sample(tasks, min(per_lesson, len(tasks))))
    random.shuffle(pool)
    return pool[:REMIND_TASK_COUNT]


@router.get("/grammar-programs")
def list_grammar_programs(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all public grammar programs with enrollment status for authenticated users."""
    _ensure_seed(session)
    user = _try_get_user(authorization, session)
    programs = [p for p in _grammar_programs(session) if p.is_public]
    enrolled_ids: set[int] = set()
    if user:
        enrolled_ids = cache.enrollment_ids(
            session, UserGrammarProgram, UserGrammarProgram.program_id, user.id
        )
    return [
        {
            "id": p.id,
            "title": p.title,
            "title_en": p.title_en,
            "description": p.description,
            "description_en": p.description_en,
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

def _annotate_verb_lesson_progress(lessons: list[dict], user: Optional[User], session: Session) -> list[dict]:
    """Attach `best_score_pct` and `is_locked` to each verb lesson dict, in place.

    Same rule as `_annotate_lesson_progress` minus the program-enrollment unlock
    (verb lessons aren't split across enrollable programs): lesson N is locked until
    lesson N-1's best score > 75%, the first lesson is always unlocked, unauthenticated
    users see everything unlocked, and premium/admin bypass the lock entirely.
    """
    bypass = _lock_bypassed(user)

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
        if user is None or bypass or i == 0:
            lesson["is_locked"] = False
        else:
            prev_id = lessons[i - 1]["id"]
            lesson["is_locked"] = best_scores.get(prev_id, 0.0) <= 0.75

    return lessons


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
    return _annotate_verb_lesson_progress(lessons, user, session)


@router.get("/grammar/verb-lessons/{lesson_id}/tasks")
def verb_lesson_tasks(
    lesson_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return randomized verb tasks for the given lesson.

    Counts against the daily session quota for non-premium users.
    Returns 403 if the lesson is still locked for this (free) user; premium/admin skip
    the lock (`_lock_bypassed`).
    Returns 404 if lesson_id is not in verb_lessons.json.
    """
    user = _try_get_user(authorization, session)
    # Lock check runs BEFORE the quota increment so a rejected attempt costs nothing.
    if user and not _lock_bypassed(user):
        # Conjugation (200-299) and case-governance (300-399) lessons are disjoint id
        # ranges (grammar_service.get_verb_lessons), so the first list that contains the
        # id is the one whose ordering defines this lesson's lock.
        for program_type in ("verbs", "verb_cases"):
            lessons = get_verb_lessons(session, program_type=program_type)
            if not any(l["id"] == lesson_id for l in lessons):
                continue
            annotated = _annotate_verb_lesson_progress(lessons, user, session)
            current = next(l for l in annotated if l["id"] == lesson_id)
            if current["is_locked"]:
                raise HTTPException(
                    status_code=403,
                    detail="Lesson is locked. Finish the previous lesson or upgrade to Premium.",
                )
            break
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
