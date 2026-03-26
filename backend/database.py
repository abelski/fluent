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
    Called once at application startup for new deployments.
    Schema changes are managed via Alembic migrations — run `alembic upgrade head`."""
    SQLModel.metadata.create_all(engine)


def get_session():
    """FastAPI dependency that yields a DB session per request and auto-closes it."""
    with Session(engine) as session:
        yield session
