# Main FastAPI application entry point.
# This server has two responsibilities:
#   1. REST API — all routes under /api/
#   2. Static file server — serves the pre-built Next.js export from frontend/out/
#      so a single process handles both frontend and backend in production.

import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, RedirectResponse, Response
from sqlmodel import Session, select
from auth import router as auth_router
from routers.words import router as words_router
from routers.grammar import router as grammar_router
from routers.admin import router as admin_router
from routers.reports import router as reports_router
from routers.articles import router as articles_router
from routers.constitution import router as constitution_router
from routers.practice import router as practice_router
from database import create_db_and_tables, get_session
from models import WordList, Article
from data.grammar.lessons import LESSON_CONFIG

# Resolve the static export directory relative to this file so the path works
# regardless of where the process is started from.
BASE_DIR = Path(__file__).parent.parent / "frontend"
OUT_DIR = BASE_DIR / "out"
DEV_MODE = os.getenv("DEV", "false").lower() in ("1", "true", "yes")

app = FastAPI(title="Fluent API")


@app.on_event("startup")
def on_startup():
    # Create all SQLModel tables on startup if they don't exist yet.
    # Safe to run repeatedly — SQLModel uses CREATE TABLE IF NOT EXISTS.
    create_db_and_tables()

# Allow all origins so the frontend (both localhost:3000 dev and production)
# can reach the API. In production the frontend is served from the same origin,
# so this mainly matters for local development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register API routers — all API routes are prefixed with /api to avoid
# collisions with the frontend static file routes below.
app.include_router(auth_router, prefix="/api/auth")
app.include_router(words_router, prefix="/api")
app.include_router(grammar_router, prefix="/api")
app.include_router(admin_router, prefix="/api/admin")
app.include_router(reports_router, prefix="/api")
app.include_router(articles_router, prefix="/api")
app.include_router(constitution_router, prefix="/api")
app.include_router(practice_router, prefix="/api")


@app.get("/health")
def health():
    # Simple liveness probe used by Render and other hosting platforms.
    return {"status": "ok"}


FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


@app.get("/sitemap.xml", include_in_schema=False)
def sitemap(session: Session = Depends(get_session)):
    """Dynamically generated sitemap. Includes static pages plus all published
    articles and public word lists fetched live from the database."""
    base = FRONTEND_URL.rstrip("/")

    # Static pages with priorities
    static_pages = [
        (f"{base}/", "1.0", "weekly"),
        (f"{base}/pricing/", "0.7", "monthly"),
        (f"{base}/dashboard/grammar/", "0.9", "weekly"),
        (f"{base}/dashboard/lists/", "0.8", "weekly"),
        (f"{base}/dashboard/articles/", "0.8", "weekly"),
    ]

    urls = []
    for loc, priority, changefreq in static_pages:
        urls.append(
            f"  <url>\n"
            f"    <loc>{loc}</loc>\n"
            f"    <priority>{priority}</priority>\n"
            f"    <changefreq>{changefreq}</changefreq>\n"
            f"  </url>"
        )

    # Published articles — individual pages
    articles = session.exec(
        select(Article).where(Article.published == True)
    ).all()
    for article in articles:
        lastmod = article.updated_at.strftime("%Y-%m-%d")
        urls.append(
            f"  <url>\n"
            f"    <loc>{base}/dashboard/articles/{article.slug}/</loc>\n"
            f"    <lastmod>{lastmod}</lastmod>\n"
            f"    <priority>0.7</priority>\n"
            f"    <changefreq>monthly</changefreq>\n"
            f"  </url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls)
        + "\n</urlset>"
    )
    return Response(content=xml, media_type="application/xml")


@app.get("/robots.txt", include_in_schema=False)
def robots_txt():
    """robots.txt pointing crawlers at the sitemap and blocking auth-only areas."""
    base = FRONTEND_URL.rstrip("/")
    content = (
        "User-agent: *\n"
        "Allow: /\n"
        "Allow: /pricing/\n"
        "Allow: /dashboard/grammar/\n"
        "Allow: /dashboard/articles/\n"
        "Allow: /dashboard/lists/\n"
        "Disallow: /dashboard/admin/\n"
        "Disallow: /dashboard/practice/\n"
        "Disallow: /dashboard/review/\n"
        "Disallow: /api/\n"
        f"\nSitemap: {base}/sitemap.xml\n"
    )
    return Response(content=content, media_type="text/plain")


@app.get("/llms.txt", include_in_schema=False)
def llms_txt(session: Session = Depends(get_session)):
    """llms.txt — machine-readable site description for AI crawlers (llmstxt.org standard).
    Content counts and topic names are fetched live from the database."""
    base = FRONTEND_URL.rstrip("/")

    lists = session.exec(
        select(WordList).where(WordList.is_public == True, WordList.archived == False)
    ).all()
    articles = session.exec(
        select(Article).where(Article.published == True)
    ).all()

    lesson_count = len(LESSON_CONFIG)
    list_count = len(lists)
    article_count = len(articles)

    # Group list titles by subcategory
    by_subcategory: dict[str, list[str]] = {}
    for wl in lists:
        key = wl.subcategory or "General"
        by_subcategory.setdefault(key, []).append(wl.title)

    vocab_lines = []
    for subcat, titles in by_subcategory.items():
        vocab_lines.append(f"- {subcat}: {', '.join(titles)}")

    article_lines = [f"- [{a.title_en}]({base}/dashboard/articles/{a.slug}/)" for a in articles]

    content = (
        f"# Fluent\n\n"
        f"> Free Lithuanian language learning app with spaced repetition flashcards, "
        f"grammar exercises, and real-world reading articles.\n\n"
        f"## What this app teaches\n"
        f"Lithuanian vocabulary and grammar for English and Russian speakers, "
        f"organized by CEFR levels (A1–B2). Covers all major Lithuanian noun cases "
        f"with fill-in-the-gap exercises, plus a growing library of reading texts.\n\n"
        f"## Vocabulary ({list_count} lists)\n"
        + "\n".join(vocab_lines)
        + f"\n\n## Grammar ({lesson_count} lessons)\n"
        f"Interactive exercises covering Lithuanian noun cases: Galininkas, Kilmininkas, "
        f"Naudininkas, Vardininkas, Įnagininkas, Vietininkas and more. "
        f"Each lesson uses spaced repetition with fill-in-the-gap sentences.\n\n"
        f"## Reading articles ({article_count} texts)\n"
        + "\n".join(article_lines)
        + f"\n\n## Who it's for\n"
        f"Beginners to intermediate learners of Lithuanian (A1–B2 level). "
        f"Interface available in English and Russian.\n\n"
        f"## Key features\n"
        f"- Spaced repetition flashcard study\n"
        f"- Grammar exercises with immediate feedback\n"
        f"- Progress tracking across sessions\n"
        f"- Free to use, no account required to browse\n\n"
        f"## Links\n"
        f"- App: {base}/\n"
        f"- Grammar lessons: {base}/dashboard/grammar/\n"
        f"- Vocabulary lists: {base}/dashboard/lists/\n"
        f"- Reading articles: {base}/dashboard/articles/\n"
        f"- Pricing: {base}/pricing/\n"
    )
    return Response(content=content, media_type="text/plain; charset=utf-8")


@app.get("/")
def root():
    if DEV_MODE:
        return RedirectResponse(FRONTEND_URL)
    if not OUT_DIR.exists():
        raise HTTPException(status_code=503, detail="Frontend not built")
    index = OUT_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="Not found")


def _resolve_static(path: str) -> Path | None:
    """Resolve a URL path to a file inside the Next.js static export.

    Next.js static export generates files with dynamic segments replaced by '_'.
    For example, the route /dashboard/lists/[id]/study is exported as
    frontend/out/dashboard/lists/_/study/index.html.

    Resolution order:
      1. Exact file match  — handles assets like _next/static/*, favicon.ico
      2. Directory index   — handles clean URLs like /dashboard -> /dashboard/index.html
      3. Placeholder match — handles dynamic routes by substituting each segment with '_'
    """
    path = path.rstrip("/")

    # Exact file (e.g. _next/static/..., favicon.ico)
    exact = OUT_DIR / path
    if exact.is_file():
        return exact

    # Directory index (e.g. en/dashboard/)
    index = OUT_DIR / path / "index.html"
    if index.is_file():
        return index

    # Fallback: substitute each path segment with '_' to match dynamic [id] routes
    # e.g. dashboard/lists/42/study -> dashboard/lists/_/study
    parts = path.split("/")
    for i in range(len(parts)):
        candidate = parts.copy()
        candidate[i] = "_"
        placeholder = OUT_DIR / "/".join(candidate) / "index.html"
        if placeholder.is_file():
            return placeholder

    return None


@app.get("/{full_path:path}")
async def serve_frontend(full_path: str, request: Request):
    # Catch-all route that serves the static Next.js frontend for any path
    # not matched by the /api/* routes above.
    if DEV_MODE:
        qs = request.url.query
        url = f"{FRONTEND_URL}/{full_path}"
        if qs:
            url += f"?{qs}"
        return RedirectResponse(url)
    if not OUT_DIR.exists():
        raise HTTPException(status_code=503, detail="Frontend not built")

    resolved = _resolve_static(full_path)
    if resolved:
        # Guard against path traversal: ensure resolved path stays inside OUT_DIR
        if not resolved.resolve().is_relative_to(OUT_DIR.resolve()):
            raise HTTPException(status_code=400, detail="Invalid path")
        return FileResponse(resolved)

    raise HTTPException(status_code=404, detail="Not found")
