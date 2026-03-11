# Test configuration — patches the database engine to SQLite in-memory BEFORE
# any router or application code is imported, so no test ever touches Neon/production.
#
# How it works:
#   1. We import `database` and immediately replace its `engine` with a SQLite instance.
#   2. Because `create_db_and_tables()` and `get_session()` reference `database.engine`
#      at call time (not at import time), all subsequent DB operations use SQLite.
#   3. A session-scoped `client` fixture provides a single TestClient for all tests,
#      avoiding repeated startup overhead.
#   4. Static seed data (admin user + one word list) is inserted once per process.

import pytest
from sqlmodel import SQLModel, create_engine, Session
from sqlalchemy.pool import StaticPool
from fastapi.testclient import TestClient

import database as _db

# Capture the original get_session function reference BEFORE any patching.
# This reference is used as the FastAPI dependency override key — routers imported
# `get_session` from database at their load time, and that reference must match.
_original_get_session = _db.get_session

# ── 1. Patch engine before anything else loads ────────────────────────────────
# StaticPool forces all connections to share a single in-memory SQLite connection.
# Without it, each new Session gets a fresh empty database (SQLite :memory: behaviour).
_test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
_db.engine = _test_engine


def _override_get_session():
    with Session(_test_engine) as s:
        yield s


# ── 2. Create all tables in SQLite ────────────────────────────────────────────
# Import models so their metadata is registered before create_all.
from models import User, WordList, Word, WordListItem, UserWordProgress, DailyStudySession, GrammarLessonResult, MistakeReport  # noqa: E402

SQLModel.metadata.create_all(_test_engine)


# ── 3. Seed minimum static data required by tests ────────────────────────────
def _seed_static() -> None:
    with Session(_test_engine) as s:
        # Admin user — required by admin endpoint tests.
        admin = User(
            id="admin-test-id",
            email="artyrbelski@gmail.com",
            name="Artur",
            is_admin=True,
            is_superadmin=True,
        )
        s.add(admin)

        # A non-admin user — required by grant/revoke premium tests.
        regular = User(
            id="regular-test-id",
            email="test_user@example.com",
            name="Test User",
            is_admin=False,
        )
        s.add(regular)

        # One word list with one word — required by daily-limit enforcement tests.
        wl = WordList(id=1, title="Test List", is_public=True)
        s.add(wl)
        w = Word(id=1, lithuanian="vienas", translation_en="one", translation_ru="один")
        s.add(w)
        item = WordListItem(id=1, word_list_id=1, word_id=1, position=0)
        s.add(item)

        s.commit()


_seed_static()


# ── 4. Session-scoped TestClient fixture ─────────────────────────────────────
@pytest.fixture(scope="session")
def client():
    from main import app

    # Key must be the ORIGINAL get_session — that's what every router captured
    # at import time via `from database import get_session`.
    app.dependency_overrides[_original_get_session] = _override_get_session
    with TestClient(app, raise_server_exceptions=False) as c:
        yield c
    app.dependency_overrides.clear()
