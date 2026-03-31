# News API — public reading endpoints + admin CRUD.
# Public routes: GET /api/news
# Admin routes:  GET/POST /api/admin/news,
#                PUT/DELETE /api/admin/news/{id}

from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from auth import require_user as _decode_user
from database import get_session
from models import NewsPost, User

router = APIRouter()


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _require_admin(authorization: Optional[str], session: Session) -> User:
    user = _decode_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


# ── Public endpoints ──────────────────────────────────────────────────────────

@router.get("/news")
def list_news(
    limit: int = 20,
    offset: int = 0,
    session: Session = Depends(get_session),
):
    """Return published news posts sorted by published_at DESC."""
    posts = session.exec(
        select(NewsPost)
        .where(NewsPost.published == True)  # noqa: E712
        .order_by(NewsPost.published_at.desc())
        .offset(offset)
        .limit(limit)
    ).all()
    return [
        {
            "id": p.id,
            "title_ru": p.title_ru,
            "title_en": p.title_en,
            "body_ru": p.body_ru,
            "body_en": p.body_en,
            "published_at": p.published_at,
        }
        for p in posts
    ]


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.get("/admin/news")
def admin_list_news(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: list all news posts including unpublished."""
    _require_admin(authorization, session)
    posts = session.exec(select(NewsPost).order_by(NewsPost.published_at.desc())).all()
    return [
        {
            "id": p.id,
            "title_ru": p.title_ru,
            "title_en": p.title_en,
            "body_ru": p.body_ru,
            "body_en": p.body_en,
            "published_at": p.published_at,
            "created_at": p.created_at,
            "published": p.published,
        }
        for p in posts
    ]


class NewsPostBody(BaseModel):
    title_ru: str
    title_en: str
    body_ru: str = ""
    body_en: str = ""
    published_at: Optional[datetime] = None
    published: bool = True


@router.post("/admin/news")
def create_news(
    body: NewsPostBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: create a new news post."""
    _require_admin(authorization, session)
    if not body.title_ru.strip() or not body.title_en.strip():
        raise HTTPException(status_code=400, detail="title_ru and title_en are required")
    post = NewsPost(
        title_ru=body.title_ru,
        title_en=body.title_en,
        body_ru=body.body_ru,
        body_en=body.body_en,
        published_at=body.published_at or _utcnow(),
        published=body.published,
    )
    session.add(post)
    session.commit()
    session.refresh(post)
    return {"ok": True, "id": post.id}


@router.put("/admin/news/{post_id}")
def update_news(
    post_id: int,
    body: NewsPostBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: update an existing news post."""
    _require_admin(authorization, session)
    post = session.get(NewsPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="News post not found")
    if not body.title_ru.strip() or not body.title_en.strip():
        raise HTTPException(status_code=400, detail="title_ru and title_en are required")
    post.title_ru = body.title_ru
    post.title_en = body.title_en
    post.body_ru = body.body_ru
    post.body_en = body.body_en
    post.published_at = body.published_at or post.published_at
    post.published = body.published
    session.add(post)
    session.commit()
    return {"ok": True}


@router.delete("/admin/news/{post_id}")
def delete_news(
    post_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: permanently delete a news post."""
    _require_admin(authorization, session)
    post = session.get(NewsPost, post_id)
    if not post:
        raise HTTPException(status_code=404, detail="News post not found")
    session.delete(post)
    session.commit()
    return {"ok": True}
