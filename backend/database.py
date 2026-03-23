# Database engine configuration and session factory.
# Uses SQLModel (SQLAlchemy under the hood) with psycopg3 driver to connect
# to a PostgreSQL instance hosted on Neon (serverless Postgres).

import os
import re
from sqlmodel import SQLModel, create_engine, Session
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

if DATABASE_URL:
    # Normalize the URL to use the psycopg3 dialect.
    # Neon / Heroku provide a "postgres://" or "postgresql://" URL but SQLAlchemy
    # needs "postgresql+psycopg://" to pick the psycopg3 driver.
    DATABASE_URL = re.sub(r"^postgres(ql)?://", "postgresql+psycopg://", DATABASE_URL)

    # channel_binding is a psycopg2-only parameter — psycopg3 rejects it,
    # so strip it from the URL if present.
    DATABASE_URL = re.sub(r"[&?]channel_binding=[^&]*", "", DATABASE_URL)

    # Neon requires SSL — append sslmode=require if not already set.
    if "sslmode" not in DATABASE_URL:
        DATABASE_URL += ("&" if "?" in DATABASE_URL else "?") + "sslmode=require"

engine = create_engine(
    DATABASE_URL,
    echo=False,         # Set to True locally to log all SQL queries for debugging
    pool_size=5,        # Keep 5 persistent connections ready
    max_overflow=10,    # Allow up to 10 extra connections under load
    pool_pre_ping=True, # Test connections before use to handle Neon's idle timeouts
)


def create_db_and_tables():
    """Create all tables defined in SQLModel metadata if they don't exist yet.
    Called once at application startup — safe to run on every deploy."""
    SQLModel.metadata.create_all(engine)
    _run_migrations()


def _run_migrations():
    """Apply incremental schema changes that create_all cannot handle (new columns on existing tables).

    Each statement is wrapped in try/except so it is safe to run on every deploy:
    PostgreSQL and SQLite both raise an error if the column already exists — we just ignore it.
    """
    from sqlalchemy import text
    with Session(engine) as s:
        try:
            s.exec(text(
                "ALTER TABLE user_word_progress "
                "ADD COLUMN mistake_count INTEGER NOT NULL DEFAULT 0"
            ))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE word_list ADD COLUMN cefr_level VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE word_list ADD COLUMN difficulty VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE word_list ADD COLUMN article_url VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN article_name VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN article_name_ru VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN article_name_en VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE word_list ADD COLUMN sort_order INTEGER DEFAULT 0"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN sort_order INTEGER DEFAULT 0"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN name_ru VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN name_en VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE grammar_sentence ADD COLUMN use_in_basic BOOLEAN NOT NULL DEFAULT TRUE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE grammar_sentence ADD COLUMN use_in_advanced BOOLEAN NOT NULL DEFAULT TRUE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE grammar_sentence ADD COLUMN use_in_practice BOOLEAN NOT NULL DEFAULT TRUE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT FALSE"))
            s.exec(text("UPDATE subcategory_meta SET is_published = TRUE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE grammar_case_rule ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT FALSE"))
            s.exec(text("UPDATE grammar_case_rule SET is_published = TRUE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text('ALTER TABLE "user" ADD COLUMN last_login TIMESTAMP'))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text(
                "CREATE TABLE IF NOT EXISTS practice_category ("
                "  id SERIAL PRIMARY KEY,"
                "  name_ru VARCHAR NOT NULL,"
                "  name_en VARCHAR,"
                "  description_ru VARCHAR,"
                "  sort_order INTEGER NOT NULL DEFAULT 0,"
                "  created_at TIMESTAMP NOT NULL DEFAULT NOW()"
                ")"
            ))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE practice_test ADD COLUMN category_id INTEGER REFERENCES practice_category(id)"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE practice_test ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT FALSE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            # Seed: create Constitution category and link existing test if not already done
            existing = s.exec(text("SELECT id FROM practice_category WHERE name_ru = 'Конституция'")).first()
            if not existing:
                s.exec(text(
                    "INSERT INTO practice_category (name_ru, name_en, description_ru, sort_order, created_at) "
                    "VALUES ('Конституция', 'Constitution', 'Подготовка к гражданству и ПМЖ', 0, NOW())"
                ))
                s.commit()
            cat = s.exec(text("SELECT id FROM practice_category WHERE name_ru = 'Конституция'")).first()
            if cat:
                s.exec(text(f"UPDATE practice_test SET category_id = {cat[0]} WHERE category_id IS NULL AND title_ru ILIKE '%конституц%'"))
                s.commit()
        except Exception:
            s.rollback()


def get_session():
    """FastAPI dependency that yields a DB session per request and auto-closes it."""
    with Session(engine) as session:
        yield session
