from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from auth import require_user as _decode_user
from database import get_session
from models import Feedback, User

router = APIRouter()


def _require_admin(authorization: Optional[str], session: Session) -> User:
    user = _decode_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


class FeedbackCreate(BaseModel):
    email: str
    message: str


@router.post("/feedback")
def submit_feedback(
    body: FeedbackCreate,
    session: Session = Depends(get_session),
):
    """Submit anonymous feedback. No authentication required."""
    email = body.email.strip()
    message = body.message.strip()
    if not email:
        raise HTTPException(status_code=422, detail="Email is required")
    if not message:
        raise HTTPException(status_code=422, detail="Message is required")
    if len(message) > 2000:
        raise HTTPException(status_code=422, detail="Message must be 2000 characters or fewer")

    row = Feedback(email=email, message=message)
    session.add(row)
    session.commit()
    return {"ok": True}


@router.get("/admin/feedback")
def list_feedback(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all feedback entries, newest first. Admin only."""
    _require_admin(authorization, session)
    rows = session.exec(select(Feedback).order_by(Feedback.created_at.desc())).all()
    return [
        {
            "id": r.id,
            "email": r.email,
            "message": r.message,
            "created_at": r.created_at,
        }
        for r in rows
    ]


@router.delete("/admin/feedback/{feedback_id}")
def delete_feedback(
    feedback_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Hard-delete a feedback entry. Admin only."""
    _require_admin(authorization, session)
    row = session.get(Feedback, feedback_id)
    if not row:
        raise HTTPException(status_code=404, detail="Not found")
    session.delete(row)
    session.commit()
    return {"ok": True}
