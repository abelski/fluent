# Articles API — public reading endpoints + admin CRUD/import/export.
# Public routes: GET /api/articles, GET /api/articles/{slug}
# Admin routes:  GET/POST /api/admin/articles,
#                PUT/DELETE /api/admin/articles/{slug},
#                GET /api/admin/articles/{slug}/export,
#                POST /api/admin/articles/import

import re
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, File, Header, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import Session, select

from auth import require_user as _decode_user
from database import get_session
from models import Article, User

router = APIRouter()

_VALID_CATEGORIES = {"learning_materials", "adaptation", "blog"}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _require_admin(authorization: Optional[str], session: Session) -> User:
    user = _decode_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _tags_list(tags_str: str) -> list[str]:
    return [t.strip() for t in tags_str.split(",") if t.strip()] if tags_str else []


# ── Public endpoints ──────────────────────────────────────────────────────────

@router.get("/articles")
def list_articles(category: Optional[str] = None, session: Session = Depends(get_session)):
    """Return all published articles that are not pinned to the footer (summary only, no body).

    Optional `?category=` filters to one of `_VALID_CATEGORIES`; omitted returns all (default).
    """
    if category is not None and category not in _VALID_CATEGORIES:
        raise HTTPException(status_code=400, detail="Invalid category")
    query = (
        select(Article)
        .where(Article.published == True)  # noqa: E712
        .where(Article.show_in_footer == False)  # noqa: E712
    )
    if category is not None:
        query = query.where(Article.category == category)
    articles = session.exec(query.order_by(Article.created_at.desc())).all()
    return [
        {
            "slug": a.slug,
            "title_ru": a.title_ru,
            "title_en": a.title_en,
            "tags": _tags_list(a.tags),
            "category": a.category,
            "created_at": a.created_at,
        }
        for a in articles
    ]


@router.get("/footer-articles")
def list_footer_articles(session: Session = Depends(get_session)):
    """Return published articles pinned to the footer nav (slug + titles only)."""
    articles = session.exec(
        select(Article)
        .where(Article.published == True)  # noqa: E712
        .where(Article.show_in_footer == True)  # noqa: E712
        .order_by(Article.created_at.asc())
    ).all()
    return [
        {
            "slug": a.slug,
            "title_ru": a.title_ru,
            "title_en": a.title_en,
        }
        for a in articles
    ]


@router.get("/articles/{slug}")
def get_article(slug: str, session: Session = Depends(get_session)):
    """Return a single published article with full body."""
    article = session.exec(select(Article).where(Article.slug == slug)).first()
    if not article or not article.published:
        raise HTTPException(status_code=404, detail="Article not found")
    return {
        "slug": article.slug,
        "title_ru": article.title_ru,
        "title_en": article.title_en,
        "body_ru": article.body_ru,
        "body_en": article.body_en,
        "tags": _tags_list(article.tags),
        "category": article.category,
        "created_at": article.created_at,
        "updated_at": article.updated_at,
    }


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.get("/admin/articles")
def admin_list_articles(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: list all articles including unpublished drafts."""
    _require_admin(authorization, session)
    articles = session.exec(select(Article).order_by(Article.created_at.desc())).all()
    return [
        {
            "id": a.id,
            "slug": a.slug,
            "title_ru": a.title_ru,
            "title_en": a.title_en,
            "tags": _tags_list(a.tags),
            "category": a.category,
            "published": a.published,
            "show_in_footer": a.show_in_footer,
            "created_at": a.created_at,
            "updated_at": a.updated_at,
        }
        for a in articles
    ]


@router.get("/admin/articles/{slug}")
def admin_get_article(
    slug: str,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: get a single article (including unpublished)."""
    _require_admin(authorization, session)
    article = session.exec(select(Article).where(Article.slug == slug)).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    return {
        "id": article.id,
        "slug": article.slug,
        "title_ru": article.title_ru,
        "title_en": article.title_en,
        "body_ru": article.body_ru,
        "body_en": article.body_en,
        "tags": article.tags,
        "category": article.category,
        "published": article.published,
        "show_in_footer": article.show_in_footer,
        "created_at": article.created_at,
        "updated_at": article.updated_at,
    }


class ArticleBody(BaseModel):
    slug: str
    title_ru: str
    title_en: str
    body_ru: str = ""
    body_en: str = ""
    tags: str = ""
    category: str
    published: bool = True
    show_in_footer: bool = False


@router.post("/admin/articles")
def create_article(
    body: ArticleBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: create a new article."""
    _require_admin(authorization, session)
    if not body.slug or not body.title_ru or not body.title_en:
        raise HTTPException(status_code=400, detail="slug, title_ru and title_en are required")
    if body.category not in _VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail="Invalid category")
    existing = session.exec(select(Article).where(Article.slug == body.slug)).first()
    if existing:
        raise HTTPException(status_code=409, detail="Slug already exists")
    article = Article(
        slug=body.slug,
        title_ru=body.title_ru,
        title_en=body.title_en,
        body_ru=body.body_ru,
        body_en=body.body_en,
        tags=body.tags,
        category=body.category,
        published=body.published,
        show_in_footer=body.show_in_footer,
    )
    session.add(article)
    session.commit()
    session.refresh(article)
    return {"ok": True, "id": article.id, "slug": article.slug}


@router.put("/admin/articles/{slug}")
def update_article(
    slug: str,
    body: ArticleBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: update an existing article."""
    _require_admin(authorization, session)
    if body.category not in _VALID_CATEGORIES:
        raise HTTPException(status_code=422, detail="Invalid category")
    article = session.exec(select(Article).where(Article.slug == slug)).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    # Slug rename: check no collision
    if body.slug != slug:
        collision = session.exec(select(Article).where(Article.slug == body.slug)).first()
        if collision and collision.id != article.id:
            raise HTTPException(status_code=409, detail="Slug already exists")
        article.slug = body.slug
    article.title_ru = body.title_ru
    article.title_en = body.title_en
    article.body_ru = body.body_ru
    article.body_en = body.body_en
    article.tags = body.tags
    article.category = body.category
    article.published = body.published
    article.show_in_footer = body.show_in_footer
    article.updated_at = _utcnow()
    session.add(article)
    session.commit()
    return {"ok": True}


@router.delete("/admin/articles/{slug}")
def delete_article(
    slug: str,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: permanently delete an article."""
    _require_admin(authorization, session)
    article = session.exec(select(Article).where(Article.slug == slug)).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    session.delete(article)
    session.commit()
    return {"ok": True}


# ── Import / Export ───────────────────────────────────────────────────────────

def _article_to_markdown(article: Article) -> str:
    """Serialise an Article to the canonical markdown-with-frontmatter format."""
    published_str = "true" if article.published else "false"
    parts = [
        "---",
        f"slug: {article.slug}",
        f"title_ru: {article.title_ru}",
        f"title_en: {article.title_en}",
        f"tags: {article.tags or ''}",
        f"category: {article.category or 'blog'}",
        f"published: {published_str}",
        "---",
        "",
        article.body_ru or "",
        "",
        "---EN---",
        "",
        article.body_en or "",
    ]
    return "\n".join(parts)


def _parse_markdown_article(content: str) -> dict:
    """Parse an article file (YAML frontmatter + bilingual body).

    Format:
        ---
        slug: some-slug
        title_ru: ...
        title_en: ...
        tags: tag1,tag2
        published: true
        ---

        <Russian body markdown>

        ---EN---

        <English body markdown>
    """
    fm_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not fm_match:
        raise ValueError("Missing YAML frontmatter block (expected --- ... ---)")

    fm = fm_match.group(1)
    body_part = content[fm_match.end():]

    def _get(key: str) -> str:
        m = re.search(rf"^{key}:\s*(.+)$", fm, re.MULTILINE)
        return m.group(1).strip() if m else ""

    slug = _get("slug")
    title_ru = _get("title_ru")
    title_en = _get("title_en")
    tags = _get("tags")
    category = _get("category") or "blog"
    published = _get("published").lower() != "false"

    if not slug:
        raise ValueError("frontmatter missing required field: slug")
    if not title_ru:
        raise ValueError("frontmatter missing required field: title_ru")
    if not title_en:
        raise ValueError("frontmatter missing required field: title_en")
    if category not in _VALID_CATEGORIES:
        category = "blog"

    if "---EN---" in body_part:
        parts = body_part.split("---EN---", 1)
        body_ru = parts[0].strip()
        body_en = parts[1].strip()
    else:
        body_ru = body_part.strip()
        body_en = ""

    return {
        "slug": slug,
        "title_ru": title_ru,
        "title_en": title_en,
        "tags": tags,
        "category": category,
        "published": published,
        "body_ru": body_ru,
        "body_en": body_en,
    }


@router.get("/admin/articles/{slug}/export")
def export_article(
    slug: str,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: download article as a .md file."""
    _require_admin(authorization, session)
    article = session.exec(select(Article).where(Article.slug == slug)).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")
    content = _article_to_markdown(article)
    return Response(
        content=content.encode("utf-8"),
        media_type="text/markdown",
        headers={"Content-Disposition": f'attachment; filename="{slug}.md"'},
    )


@router.post("/admin/articles/import")
async def import_article(
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Admin: import (create or update) an article from an uploaded .md file."""
    _require_admin(authorization, session)
    raw = await file.read()
    try:
        content = raw.decode("utf-8")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="File must be UTF-8 encoded")
    try:
        data = _parse_markdown_article(content)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    existing = session.exec(select(Article).where(Article.slug == data["slug"])).first()
    if existing:
        existing.title_ru = data["title_ru"]
        existing.title_en = data["title_en"]
        existing.body_ru = data["body_ru"]
        existing.body_en = data["body_en"]
        existing.tags = data["tags"]
        existing.category = data["category"]
        existing.published = data["published"]
        existing.updated_at = _utcnow()
        session.add(existing)
        session.commit()
        return {"ok": True, "action": "updated", "slug": data["slug"]}

    article = Article(**data)
    session.add(article)
    session.commit()
    return {"ok": True, "action": "created", "slug": data["slug"]}
