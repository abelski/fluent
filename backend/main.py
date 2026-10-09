# Main FastAPI application entry point.
# This server has two responsibilities:
#   1. REST API — all routes under /api/
#   2. Static file server — serves the pre-built Next.js export from frontend/out/
#      so a single process handles both frontend and backend in production.

import os
from datetime import datetime, timezone
from pathlib import Path
import logging
import re
import threading
import time
from urllib.parse import quote, unquote, urlparse
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException, Request, Depends, Response as FastAPIResponse
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
from routers.feedback import router as feedback_router
from routers.news import router as news_router
from routers.custom_programs import router as custom_programs_router
from routers.phrases import router as phrases_router
from routers.phrase_lists import router as phrase_lists_router
from routers.word_lists import router as word_lists_router
from routers.extension import router as extension_router
from routers.continue_session import router as continue_session_router
from routers.billing import router as billing_router
from routers.inbox import router as inbox_router
from routers.audio import router as audio_router
from routers.knowledge_check import router as knowledge_check_router
from database import create_db_and_tables, get_session
from models import WordList, Article, SubcategoryMeta, AppSetting, PhraseProgram, PreparedMessage, InboxMessage, InboxDelivery, UserAchievement  # noqa: F401 — registers table
from data.grammar.lessons import LESSON_CONFIG
from scheduler import start_scheduler
import indexnow

# Resolve the static export directory relative to this file so the path works
# regardless of where the process is started from.
BASE_DIR = Path(__file__).parent.parent / "frontend"
OUT_DIR = BASE_DIR / "out"
DEV_MODE = os.getenv("DEV", "false").lower() in ("1", "true", "yes")

app = FastAPI(title="Fluent API")


@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "SAMEORIGIN"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


from constants import DEFAULT_CEFR_THRESHOLDS as _DEFAULT_CEFR_THRESHOLDS


@app.on_event("startup")
def on_startup():
    # Create all SQLModel tables on startup if they don't exist yet.
    # Safe to run repeatedly — SQLModel uses CREATE TABLE IF NOT EXISTS.
    create_db_and_tables()
    start_scheduler()
    if indexnow.enabled():
        from database import engine as _engine
        threading.Thread(target=push_indexnow_on_new_build, args=(_engine, OUT_DIR), daemon=True).start()
    # Seed default CEFR thresholds if not already set.
    import json
    from database import engine
    with Session(engine) as session:
        existing = session.exec(select(AppSetting).where(AppSetting.key == "cefr_thresholds")).first()
        if not existing:
            session.add(AppSetting(key="cefr_thresholds", value=json.dumps(_DEFAULT_CEFR_THRESHOLDS)))
            session.commit()
        welcome_article = session.exec(select(Article).where(Article.slug == "welcome")).first()
        if not welcome_article:
            session.add(Article(
                slug="welcome",
                title_ru="Добро пожаловать в Fluent!",
                title_en="Welcome to Fluent!",
                body_ru=(
                    "Fluent поможет вам выучить литовский язык — слово за словом, шаг за шагом.\n\n"
                    "## С чего начать?\n\n"
                    "**Списки слов** — учите тематическую лексику по уровням CEFR.\n\n"
                    "**Повторение** — система интервальных повторений закрепит знания и напомнит о словах в нужный момент.\n\n"
                    "**Грамматика** — упражнения на падежи и грамматические конструкции литовского языка.\n\n"
                    "**Статьи** — читайте тексты на литовском языке и расширяйте словарный запас в контексте."
                ),
                body_en=(
                    "Fluent will help you learn Lithuanian — word by word, step by step.\n\n"
                    "## Where to start?\n\n"
                    "**Vocabulary lists** — learn thematic vocabulary organised by CEFR level.\n\n"
                    "**Spaced repetition** — our review system reinforces what you know and resurfaces words at the right moment.\n\n"
                    "**Grammar** — exercises on Lithuanian cases and grammatical structures.\n\n"
                    "**Articles** — read texts in Lithuanian and expand your vocabulary in context."
                ),
                published=False,
                show_in_footer=False,
            ))
            session.commit()

# Restrict CORS to the frontend origin. In production the frontend is served
# from the same origin, so CORS only matters for local development.
_frontend_url = os.getenv("FRONTEND_URL", "http://localhost:3000")
_allowed_origins = {"http://localhost:3000", "http://localhost:8000", _frontend_url}
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_allowed_origins),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
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
app.include_router(feedback_router, prefix="/api")
app.include_router(news_router, prefix="/api")
app.include_router(custom_programs_router, prefix="/api")
app.include_router(phrases_router, prefix="/api")
app.include_router(phrase_lists_router, prefix="/api")
app.include_router(word_lists_router, prefix="/api")
app.include_router(extension_router, prefix="/api")
app.include_router(continue_session_router, prefix="/api")
app.include_router(billing_router, prefix="/api")
app.include_router(inbox_router, prefix="/api")
app.include_router(audio_router, prefix="/api")
app.include_router(knowledge_check_router, prefix="/api")


@app.get("/health")
def health():
    # Simple liveness probe used by Render and other hosting platforms.
    return {"status": "ok"}


FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")


def _sitemap_url(loc: str, lastmod: str, priority: str, changefreq: str, links: str = "") -> str:
    return (
        f"  <url>\n"
        f"    <loc>{loc}</loc>\n"
        f"{links}"
        f"    <lastmod>{lastmod}</lastmod>\n"
        f"    <priority>{priority}</priority>\n"
        f"    <changefreq>{changefreq}</changefreq>\n"
        f"  </url>"
    )


def _sitemap_pair(ru_loc: str, en_loc: str, lastmod: str, priority: str, changefreq: str) -> list[str]:
    """Both <url> entries of a RU/EN twin pair (#48c). Each lists all three
    hreflang links, itself included; RU is x-default."""
    links = (
        f'    <xhtml:link rel="alternate" hreflang="ru" href="{ru_loc}"/>\n'
        f'    <xhtml:link rel="alternate" hreflang="en" href="{en_loc}"/>\n'
        f'    <xhtml:link rel="alternate" hreflang="x-default" href="{ru_loc}"/>\n'
    )
    return [_sitemap_url(loc, lastmod, priority, changefreq, links) for loc in (ru_loc, en_loc)]


def _has_en(article: Article) -> bool:
    """Content gate, same as the frontend build: EN twin only with an English title and body."""
    return bool((article.title_en or "").strip() and (article.body_en or "").strip())


def _article_locs(base: str, article: Article) -> list[str]:
    """Sitemap <loc>s of one article: RU, plus the /en/ twin when it has English content.
    The slug is percent-encoded exactly as Next.js encodes the on-page canonical (#48c)."""
    path = f"/dashboard/articles/{quote(article.slug, safe='')}/"
    return [f"{base}{path}", f"{base}/en{path}"] if _has_en(article) else [f"{base}{path}"]


def _sitemap_locs(session: Session) -> list[str]:
    """Every <loc> in sitemap.xml, in sitemap order — parsed from sitemap() so there is one source."""
    return re.findall(r"<loc>(.*?)</loc>", sitemap(session).body.decode())


@app.api_route("/sitemap.xml", methods=["GET", "HEAD"], include_in_schema=False)
def sitemap(session: Session = Depends(get_session)):
    """Dynamically generated sitemap. Includes static pages plus all published
    articles and public word lists fetched live from the database."""
    base = FRONTEND_URL.rstrip("/")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Static pages with priorities
    static_pages = [
        (f"{base}/", "1.0", "weekly"),
        (f"{base}/pricing/", "0.7", "monthly"),
        (f"{base}/dashboard/grammar/", "0.9", "weekly"),
        (f"{base}/dashboard/lists/", "0.8", "weekly"),
        (f"{base}/dashboard/articles/", "0.8", "weekly"),
        (f"{base}/programs/", "0.8", "weekly"),
        (f"{base}/dashboard/phrases/", "0.8", "weekly"),
        (f"{base}/extension/", "0.6", "monthly"),
    ]

    urls = []
    for loc, priority, changefreq in static_pages:
        if loc == f"{base}/dashboard/articles/":
            urls.extend(_sitemap_pair(loc, f"{base}/en/dashboard/articles/", today, priority, changefreq))
        else:
            urls.append(_sitemap_url(loc, today, priority, changefreq))

    # Published articles — individual pages. The slug is percent-encoded exactly as
    # Next.js encodes the on-page canonical/hreflang (Lithuanian letters, #48c).
    articles = session.exec(
        select(Article).where(Article.published == True)
    ).all()
    for article in articles:
        lastmod = article.updated_at.strftime("%Y-%m-%d")
        locs = _article_locs(base, article)
        if len(locs) == 2:
            urls.extend(_sitemap_pair(locs[0], locs[1], lastmod, "0.7", "monthly"))
        else:
            urls.append(_sitemap_url(locs[0], lastmod, "0.7", "monthly"))

    # Program detail pages — one per published subcategory
    programs = session.exec(select(SubcategoryMeta)).all()
    for program in programs:
        urls.append(
            f"  <url>\n"
            f"    <loc>{base}/programs/{program.key}/</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"    <priority>0.7</priority>\n"
            f"    <changefreq>weekly</changefreq>\n"
            f"  </url>"
        )

    # Phrase program detail pages — one per public program
    phrase_programs = session.exec(
        select(PhraseProgram).where(PhraseProgram.is_public == True)  # noqa: E712
    ).all()
    for pp in phrase_programs:
        urls.append(
            f"  <url>\n"
            f"    <loc>{base}/dashboard/phrases/{pp.id}/</loc>\n"
            f"    <lastmod>{today}</lastmod>\n"
            f"    <priority>0.6</priority>\n"
            f"    <changefreq>weekly</changefreq>\n"
            f"  </url>"
        )

    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'
        ' xmlns:xhtml="http://www.w3.org/1999/xhtml">\n'
        + "\n".join(urls)
        + "\n</urlset>"
    )
    return Response(content=xml, media_type="application/xml")


def _in_build(loc: str) -> bool:
    """True when `next build` prerendered this page (until then it is the `_` placeholder)."""
    path = unquote(urlparse(loc).path).strip("/")
    return (OUT_DIR / path / "index.html").is_file() if path else (OUT_DIR / "index.html").is_file()


def push_indexnow_on_new_build(engine, out_dir: Path) -> None:
    """On the first start of a new build, send IndexNow the sitemap URLs that are new or edited
    since the previous push and whose page is in the build (#59a). Runs in a daemon thread."""
    import json
    try:
        # ponytail: fixed delay so this instance serves the key file before IndexNow fetches it;
        # poll the key URL instead if 90 s ever proves too short.
        time.sleep(90)
        build_file = out_dir.parent / ".next" / "BUILD_ID"
        if not build_file.is_file():
            return
        build_id = build_file.read_text().strip()
        built_at = datetime.fromtimestamp(build_file.stat().st_mtime, timezone.utc).replace(tzinfo=None)
        base = FRONTEND_URL.rstrip("/")
        with Session(engine) as s:
            row = s.exec(select(AppSetting).where(AppSetting.key == "indexnow_state")).first()
            prev = json.loads(row.value) if row else None
            if prev and prev.get("build_id") == build_id:
                return
            candidates = [u for u in _sitemap_locs(s) if _in_build(u)]
            changed: list[str] = []
            if prev:
                since = datetime.fromisoformat(prev["built_at"])
                for a in s.exec(select(Article).where(Article.published == True)).all():  # noqa: E712
                    if since < a.updated_at <= built_at:
                        changed += _article_locs(base, a)
            urls = indexnow.pending_urls(prev["urls"] if prev else None, candidates, changed)
            if urls and indexnow.submit(base, urls) not in (200, 202):
                return  # not saved: retried on the next new build
            state = json.dumps({"build_id": build_id, "built_at": built_at.isoformat(), "urls": candidates})
            if row:
                row.value = state
                s.add(row)
            else:
                s.add(AppSetting(key="indexnow_state", value=state))
            s.commit()
    except Exception as exc:  # never break startup
        logging.getLogger(__name__).warning("IndexNow: push skipped: %s", type(exc).__name__)


@app.api_route(indexnow.KEY_PATH, methods=["GET", "HEAD"], include_in_schema=False)
def indexnow_key():
    k = indexnow.key()
    if not k:
        raise HTTPException(status_code=404)
    return Response(content=k, media_type="text/plain")


@app.api_route("/robots.txt", methods=["GET", "HEAD"], include_in_schema=False)
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
        "Allow: /programs/\n"
        "Allow: /extension/\n"
        "Disallow: /dashboard/admin/\n"
        "Disallow: /dashboard/practice/\n"
        "Disallow: /dashboard/review/\n"
        "Disallow: /dashboard/check/\n"
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
    programs = session.exec(select(SubcategoryMeta)).all()

    lesson_count = len(LESSON_CONFIG)
    list_count = len(lists)
    article_count = len(articles)
    program_count = len(programs)

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
        f"## Programs ({program_count} learning programs)\n"
        f"Curated vocabulary programs organized by topic and CEFR level. "
        f"Each program contains multiple card stacks with words and phrases. "
        f"Browse at {base}/programs/\n\n"
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
        f"- Free knowledge check with a gap analysis; Premium builds lessons from your mistakes (sign-in required)\n"
        f"- Free to use, no account required to browse\n\n"
        f"## Links\n"
        f"- App: {base}/\n"
        f"- Grammar lessons: {base}/dashboard/grammar/\n"
        f"- Vocabulary lists: {base}/dashboard/lists/\n"
        f"- Reading articles: {base}/dashboard/articles/\n"
        f"- Programs catalog: {base}/programs/\n"
        f"- Pricing: {base}/pricing/\n"
    )
    return Response(content=content, media_type="text/plain; charset=utf-8")


def _static_file_response(path: Path) -> FileResponse:
    """FileResponse with cache headers appropriate to the file's kind.

    Next.js content-hashes everything under `_next/static/` (the filename itself
    changes when the content does), so those can be cached forever. Everything else
    (HTML pages, in particular) has a stable URL whose content changes on every
    deploy — serving those with no explicit header lets browsers fall back to
    heuristic freshness, which can hold onto a pre-deploy copy for a while and show
    a stale page until a manual hard refresh. `no-cache` forces a cheap conditional
    revalidation (still ETag/304-backed) on every load instead.
    """
    headers = (
        {"Cache-Control": "public, max-age=31536000, immutable"}
        if "_next/static/" in str(path)
        else {"Cache-Control": "no-cache"}
    )
    return FileResponse(path, headers=headers)


@app.api_route("/", methods=["GET", "HEAD"])
def root():
    if DEV_MODE:
        return RedirectResponse(FRONTEND_URL)
    if not OUT_DIR.exists():
        raise HTTPException(status_code=503, detail="Frontend not built")
    index = OUT_DIR / "index.html"
    if index.is_file():
        return _static_file_response(index)
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


@app.api_route("/{full_path:path}", methods=["GET", "HEAD"])
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
        return _static_file_response(resolved)

    raise HTTPException(status_code=404, detail="Not found")
