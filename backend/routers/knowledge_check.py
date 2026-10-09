# Knowledge check + "Work on mistakes" endpoints (#62a) — see documentation/knowledge-check.md.
# Logic lives in knowledge_check_service.py; this router does auth, gating and persistence.
# The check is free of the daily quota and writes no GrammarLessonResult.

import json
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

import knowledge_check_service as kc
from auth import require_user as _require_user
from database import get_session
from models import KnowledgeCheck, User
from routers.grammar import _lock_bypassed

router = APIRouter()


def _latest_completed(user: User, session: Session) -> Optional[KnowledgeCheck]:
    return session.exec(
        select(KnowledgeCheck)
        .where(KnowledgeCheck.user_id == user.id, KnowledgeCheck.result_json != None)  # noqa: E711
        .order_by(KnowledgeCheck.id.desc())
    ).first()


def _summary(check: KnowledgeCheck) -> dict:
    result = json.loads(check.result_json)
    return {
        "id": check.id,
        "created_at": check.created_at.isoformat(),
        "correct": sum(r["correct"] for r in result),
        "total": sum(r["total"] for r in result),
        "topics": result,
    }


def _public(tasks: list[dict]) -> list[dict]:
    return [{k: v for k, v in t.items() if k != "topic"} for t in tasks]


@router.get("/me/knowledge-check")
def knowledge_check_state(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Latest completed check (or null), Premium flag, and recommendations for Premium only."""
    user = _require_user(authorization, session)
    premium = _lock_bypassed(user)
    latest = _latest_completed(user, session)
    out = {"latest": _summary(latest) if latest else None, "is_premium": premium}
    if premium:
        out["recommendations"] = (
            kc.recommendations(json.loads(latest.result_json), user, session) if latest else []
        )
    return out


@router.post("/me/knowledge-check")
def start_knowledge_check(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Start a check. Free users get one completed check; an open check is returned as is."""
    user = _require_user(authorization, session)
    if not _lock_bypassed(user) and _latest_completed(user, session):
        raise HTTPException(status_code=403, detail={"code": "premium_required"})
    open_check = session.exec(
        select(KnowledgeCheck)
        .where(KnowledgeCheck.user_id == user.id, KnowledgeCheck.result_json == None)  # noqa: E711
        .order_by(KnowledgeCheck.id.desc())
    ).first()
    if open_check:
        return {"id": open_check.id, "tasks": _public(json.loads(open_check.tasks_json))}
    tasks = kc.build_check(session)
    check = KnowledgeCheck(user_id=user.id, tasks_json=json.dumps(tasks, ensure_ascii=False))
    session.add(check)
    session.commit()
    session.refresh(check)
    return {"id": check.id, "tasks": _public(tasks)}


class AnswersIn(BaseModel):
    responses: list[Optional[str]]


@router.post("/me/knowledge-check/{check_id}/answers")
def submit_knowledge_check(
    check_id: int,
    body: AnswersIn,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Grade on the server: the picked option string per task index."""
    user = _require_user(authorization, session)
    check = session.get(KnowledgeCheck, check_id)
    if not check or check.user_id != user.id:
        raise HTTPException(status_code=404, detail="Check not found")
    if check.result_json is not None:
        raise HTTPException(status_code=409, detail={"code": "already_completed"})
    tasks = json.loads(check.tasks_json)
    if len(body.responses) != len(tasks):
        raise HTTPException(status_code=422, detail={"code": "wrong_response_count"})
    check.result_json = json.dumps(kc.grade(tasks, body.responses, session), ensure_ascii=False)
    session.add(check)
    session.commit()
    return _summary(check)


@router.get("/me/knowledge-check/gaps/tasks")
def gap_tasks(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """«Close the gaps» run — Premium only. Saved by the client via POST /grammar/lessons/0/results."""
    user = _require_user(authorization, session)
    if not _lock_bypassed(user):
        raise HTTPException(status_code=403, detail={"code": "premium_required"})
    latest = _latest_completed(user, session)
    if not latest:
        raise HTTPException(status_code=404, detail={"code": "no_check"})
    tasks = kc.gap_tasks(json.loads(latest.result_json), session)
    if not tasks:
        raise HTTPException(status_code=404, detail={"code": "no_gaps"})
    return tasks
