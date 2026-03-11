# Main FastAPI application entry point.
# This server has two responsibilities:
#   1. REST API — all routes under /api/
#   2. Static file server — serves the pre-built Next.js export from frontend/out/
#      so a single process handles both frontend and backend in production.

from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

# Import models first so all SQLModel table classes register with metadata
# before create_db_and_tables() is called at startup.
import models  # noqa: F401

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from routers.auth import router as auth_router
from routers.words import router as words_router
from routers.grammar import router as grammar_router
from core.database import create_db_and_tables

# Resolve the static export directory relative to this file so the path works
# regardless of where the process is started from.
BASE_DIR = Path(__file__).parent.parent / "frontend"
OUT_DIR = BASE_DIR / "out"

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


@app.get("/health")
def health():
    # Simple liveness probe used by Render and other hosting platforms.
    return {"status": "ok"}


@app.get("/")
def root():
    # Serve the landing page (frontend/out/index.html).
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

    # Directory index (e.g. dashboard/)
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
async def serve_frontend(full_path: str):
    # Catch-all route that serves the static Next.js frontend for any path
    # not matched by the /api/* routes above.
    if not OUT_DIR.exists():
        raise HTTPException(status_code=503, detail="Frontend not built")

    resolved = _resolve_static(full_path)
    if resolved:
        return FileResponse(resolved)

    raise HTTPException(status_code=404, detail="Not found")
