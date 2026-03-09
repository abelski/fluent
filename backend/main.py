from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from auth import router as auth_router
from routers.words import router as words_router
from database import create_db_and_tables

BASE_DIR = Path(__file__).parent.parent / "frontend"
OUT_DIR = BASE_DIR / "out"

app = FastAPI(title="Fluent API")


@app.on_event("startup")
def on_startup():
    create_db_and_tables()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth")
app.include_router(words_router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/")
def root():
    if not OUT_DIR.exists():
        raise HTTPException(status_code=503, detail="Frontend not built")
    index = OUT_DIR / "index.html"
    if index.is_file():
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="Not found")


def _resolve_static(path: str) -> Path | None:
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
async def serve_frontend(full_path: str):
    if not OUT_DIR.exists():
        raise HTTPException(status_code=503, detail="Frontend not built")

    resolved = _resolve_static(full_path)
    if resolved:
        return FileResponse(resolved)

    raise HTTPException(status_code=404, detail="Not found")
