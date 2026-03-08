import os
from pathlib import Path
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from auth import router as auth_router
from routers.words import router as words_router
from database import create_db_and_tables

# Works regardless of where uvicorn is launched from
BASE_DIR = Path(__file__).parent.parent / "frontend"

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
def index():
    return FileResponse(BASE_DIR / "index.html")


@app.get("/dashboard")
def dashboard():
    return FileResponse(BASE_DIR / "dashboard.html")


static_dir = BASE_DIR / "static"
if static_dir.exists():
    app.mount("/static", StaticFiles(directory=str(static_dir)), name="static")
