# Mistake-report endpoints.
# Any authenticated user can submit a report; admins can list and resolve them.

import os
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from jose import jwt, JWTError
from pydantic import BaseModel
from sqlmodel import Session, select

from database import get_session
from models import MistakeReport, User

router = APIRouter()

JWT_SECRET = os.getenv("JWT_SECRET", "change-me-in-production")
JWT_ALGORITHM = "HS256"


def _require_user(authorization: Optional[str], session: Session) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing token")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        email = payload["email"]
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = session.exec(select(User).where(User.email == email)).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _require_admin(authorization: Optional[str], session: Session) -> User:
    user = _require_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


class ReportCreate(BaseModel):
    context: Optional[str] = None   # e.g. 'word:42'
    description: str


@router.post("/reports")
def create_report(
    body: ReportCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Submit a mistake report. Any authenticated user."""
    user = _require_user(authorization, session)
    if not body.description.strip():
        raise HTTPException(status_code=400, detail="description required")
    report = MistakeReport(
        user_id=user.id,
        context=body.context,
        description=body.description.strip(),
    )
    session.add(report)
    session.commit()
    session.refresh(report)
    return {"ok": True, "id": report.id}


@router.get("/admin/reports")
def list_reports(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all reports (newest first). Admin-only."""
    _require_admin(authorization, session)
    reports = session.exec(
        select(MistakeReport, User)
        .join(User, User.id == MistakeReport.user_id)
        .order_by(MistakeReport.created_at.desc())  # type: ignore[arg-type]
    ).all()
    return [
        {
            "id": r.id,
            "user_name": u.name,
            "user_email": u.email,
            "context": r.context,
            "description": r.description,
            "status": r.status,
            "created_at": r.created_at,
        }
        for r, u in reports
    ]


@router.patch("/admin/reports/{report_id}/resolve")
def resolve_report(
    report_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Mark a report as resolved. Admin-only."""
    _require_admin(authorization, session)
    report = session.get(MistakeReport, report_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.status = "resolved"
    session.add(report)
    session.commit()
    return {"ok": True}
