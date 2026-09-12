"""In-app inbox API (#23) — user endpoints + superadmin broadcast composer.

One router for both halves, the way `news.py` mixes `/news` and `/admin/news`.
Users only ever see their own deliveries: every read is scoped to `require_user`'s
id, and every action's SQL carries `AND user_id = :uid`, so an id that isn't the
caller's simply doesn't come back in `affected_ids`.

Reads go through `inbox_service`'s caches, so a warm list/detail/unread-count
issues zero statements. See documentation/inbox.md.
"""

import re
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import and_, delete as sa_delete, func, or_, update as sa_update
from sqlmodel import Session, col, select

import inbox_service
from auth import require_user as _require_user
from database import get_session
from models import InboxDelivery, InboxMessage, User

router = APIRouter()

ACTIONS = ("read", "delete", "undelete")
AUDIENCES = ("users", "all", "premium", "free", "inactive")

MAX_TITLE = 120
MAX_BODY = 4000
MAX_CTA_URL = 500
MAX_ACTION_IDS = 500
MAX_RECIPIENT_IDS = 5000

# Internal paths only. Rejects `javascript:`, `//evil.host` and absolute URLs.
_INTERNAL_PATH = re.compile(r"^/(?!/)")


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _require_superadmin(authorization: Optional[str], session: Session) -> User:
    user = _require_user(authorization, session)
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _invalid(detail: str) -> HTTPException:
    return HTTPException(status_code=422, detail=detail)


# ── User endpoints ───────────────────────────────────────────────────────────

@router.get("/me/inbox/unread-count")
def get_unread_count(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Unread, not-deleted count for the badge. Zero DB statements once warm."""
    user = _require_user(authorization, session)
    return {"unread": inbox_service.unread_count(session, user.id)}


@router.get("/me/inbox")
def list_inbox(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """One page of the caller's inbox, newest first. Snippets only, no full bodies."""
    user = _require_user(authorization, session)
    return inbox_service.get_inbox(session, user.id, limit, offset)


@router.get("/me/inbox/{delivery_id}")
def get_inbox_message(
    delivery_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Full content of one message. 404 if it isn't the caller's or is deleted."""
    user = _require_user(authorization, session)
    item = inbox_service.get_delivery(session, user.id, delivery_id)
    if item is None:
        raise HTTPException(status_code=404, detail="Message not found")
    return {"item": item}


class InboxActionBody(BaseModel):
    action: str
    ids: Optional[List[int]] = None
    all: Optional[bool] = None


@router.post("/me/inbox/actions")
def inbox_actions(
    body: InboxActionBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Apply `read` / `delete` / `undelete` to the caller's own deliveries.

    One `UPDATE … RETURNING id`. Ids that aren't the caller's, or that fail the
    action's precondition, never appear in `affected_ids` — which is what lets Undo
    restore exactly what a Delete removed.
    """
    user = _require_user(authorization, session)
    user_id = user.id       # capture before the commit (#22: expire_on_commit re-SELECTs)

    if body.action not in ACTIONS:
        raise _invalid(f"action must be one of {', '.join(ACTIONS)}")
    use_all = bool(body.all)
    if use_all == (body.ids is not None):
        raise _invalid("provide exactly one of ids / all")
    if use_all and body.action != "read":
        raise _invalid("all is only allowed with the read action")
    if body.ids is not None and not 1 <= len(body.ids) <= MAX_ACTION_IDS:
        raise _invalid(f"ids must hold 1–{MAX_ACTION_IDS} entries")

    table = InboxDelivery.__table__
    conditions = [table.c.user_id == user_id]
    if body.ids is not None:
        conditions.append(table.c.id.in_(body.ids))
    if body.action == "read":
        conditions += [table.c.deleted_at.is_(None), table.c.read_at.is_(None)]
        values = {"read_at": _utcnow()}
    elif body.action == "delete":
        conditions.append(table.c.deleted_at.is_(None))
        values = {"deleted_at": _utcnow()}
    else:  # undelete
        conditions.append(table.c.deleted_at.is_not(None))
        values = {"deleted_at": None}

    affected = list(session.execute(
        sa_update(table)
        .where(and_(*conditions))
        .values(**values)
        .returning(table.c.id)
        .execution_options(cache_tags={f"inbox_delivery:user={user_id}"})
    ).scalars().all())
    session.commit()

    # One small reload of this user's flag rows, which the next list read reuses.
    return {"affected_ids": affected, "unread": inbox_service.unread_count(session, user_id)}


# ── Admin composer (superadmin only) ─────────────────────────────────────────

class AdminInboxBody(BaseModel):
    audience: str
    user_ids: Optional[List[str]] = None
    inactive_days: Optional[int] = None
    kind: str = "info"
    title_ru: str = ""
    title_en: str = ""
    body_ru: str = ""
    body_en: str = ""
    cta_label_ru: Optional[str] = None
    cta_label_en: Optional[str] = None
    cta_url: Optional[str] = None
    dry_run: bool = False


def _validated_content(body: AdminInboxBody) -> dict:
    """Server-side content validation. Never trust the composer's own checks."""
    if body.kind not in inbox_service.KINDS:
        raise _invalid(f"kind must be one of {', '.join(inbox_service.KINDS)}")
    titles = {"title_ru": (body.title_ru or "").strip(), "title_en": (body.title_en or "").strip()}
    for name, value in titles.items():
        if not value:
            raise _invalid(f"{name} is required")
        if len(value) > MAX_TITLE:
            raise _invalid(f"{name} must be at most {MAX_TITLE} characters")
    bodies = {"body_ru": body.body_ru or "", "body_en": body.body_en or ""}
    for name, value in bodies.items():
        if len(value) > MAX_BODY:
            raise _invalid(f"{name} must be at most {MAX_BODY} characters")

    cta_url = (body.cta_url or "").strip() or None
    label_ru = (body.cta_label_ru or "").strip() or None
    label_en = (body.cta_label_en or "").strip() or None
    filled = [p for p in (cta_url, label_ru, label_en) if p]
    if filled and len(filled) != 3:
        raise _invalid("cta_url, cta_label_ru and cta_label_en must all be set or all empty")
    if cta_url:
        if len(cta_url) > MAX_CTA_URL:
            raise _invalid(f"cta_url must be at most {MAX_CTA_URL} characters")
        if not _INTERNAL_PATH.match(cta_url):
            raise _invalid("cta_url must be an internal path starting with a single /")

    return {**titles, **bodies,
            "cta_url": cta_url, "cta_label_ru": label_ru, "cta_label_en": label_en}


def _resolve_recipients(body: AdminInboxBody, session: Session) -> tuple[list[str], str]:
    """Resolve the audience to user ids in SQL. Deliberately never cached — a user
    who just bought Premium must not receive a "buy Premium" offer."""
    if body.audience not in AUDIENCES:
        raise _invalid(f"audience must be one of {', '.join(AUDIENCES)}")

    now = _utcnow()
    active_premium = and_(
        col(User.is_premium).is_(True),
        or_(col(User.premium_until).is_(None), User.premium_until > now),
    )
    stmt = select(User.id)
    label = body.audience

    if body.audience == "users":
        ids = list(dict.fromkeys(body.user_ids or []))
        if not 1 <= len(ids) <= MAX_RECIPIENT_IDS:
            raise _invalid(f"user_ids must hold 1–{MAX_RECIPIENT_IDS} entries")
        stmt = stmt.where(col(User.id).in_(ids))
        label = f"users:{len(ids)}"
    elif body.audience == "premium":
        stmt = stmt.where(active_premium)
    elif body.audience == "free":
        stmt = stmt.where(~active_premium)
    elif body.audience == "inactive":
        days = body.inactive_days
        if days is None or not 1 <= days <= 3650:
            raise _invalid("inactive_days must be between 1 and 3650")
        stmt = stmt.where(func.coalesce(User.last_login, User.created_at) < now - timedelta(days=days))
        label = f"inactive:{days}"

    recipients = list(session.execute(stmt).scalars().all())
    if not recipients:
        raise _invalid("no users match this audience")
    return recipients, label


@router.post("/admin/inbox")
def admin_send_inbox(
    body: AdminInboxBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Compose and fan out a bilingual message. Superadmin-only."""
    _require_superadmin(authorization, session)
    content = _validated_content(body)
    recipients, label = _resolve_recipients(body, session)

    if body.dry_run:
        return {"recipients": len(recipients)}

    message_id, count = inbox_service.send(
        session, recipients, kind=body.kind, source="admin", audience=label, **content
    )
    session.commit()
    return {"message_id": message_id, "recipients": count}


@router.get("/admin/inbox")
def admin_list_inbox(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Sent history with recipient/read counts. Never cached — stale counts mislead."""
    _require_superadmin(authorization, session)
    rows = session.execute(
        select(
            InboxMessage.id, InboxMessage.kind, InboxMessage.title_ru,
            InboxMessage.title_en, InboxMessage.audience, InboxMessage.created_at,
        )
        .where(InboxMessage.source == "admin")
        .order_by(col(InboxMessage.created_at).desc(), col(InboxMessage.id).desc())
        .limit(100)
    ).all()
    ids = [r[0] for r in rows]
    counts: dict[int, tuple[int, int]] = {}
    if ids:
        counts = {
            mid: (total, read)
            for mid, total, read in session.execute(
                select(
                    InboxDelivery.message_id,
                    func.count(),
                    func.count(InboxDelivery.read_at),
                )
                .where(col(InboxDelivery.message_id).in_(ids))
                .group_by(col(InboxDelivery.message_id))
            ).all()
        }
    return [
        {
            "id": r[0], "kind": r[1], "title_ru": r[2], "title_en": r[3],
            "audience": r[4], "created_at": r[5],
            "recipients": counts.get(r[0], (0, 0))[0],
            "read": counts.get(r[0], (0, 0))[1],
        }
        for r in rows
    ]


@router.delete("/admin/inbox/{message_id}")
def admin_retract_inbox(
    message_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Retract a message: delete its deliveries first, then the message itself.

    Deliveries first because `models.py` declares no relationships, so nothing
    orders these for us and Postgres enforces the FK (#21). Both are Core deletes,
    so the cache eviction is table-wide — fine, retract is rare.
    """
    _require_superadmin(authorization, session)
    if not session.get(InboxMessage, message_id):
        raise HTTPException(status_code=404, detail="Message not found")
    session.execute(
        sa_delete(InboxDelivery.__table__).where(InboxDelivery.__table__.c.message_id == message_id)
    )
    session.execute(
        sa_delete(InboxMessage.__table__).where(InboxMessage.__table__.c.id == message_id)
    )
    session.commit()
    return {"ok": True}
