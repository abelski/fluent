"""Migration 005: Replace is_published/is_active with 3-state status field.

Changes:
  subcategory_meta:  add status ('draft'|'testing'|'published'), add created_by,
                     migrate is_published → status, drop is_published
  grammar_case_rule: add status, migrate is_published → status, drop is_published
  practice_test:     add status, add created_by,
                     migrate is_active → status, drop is_active

Run once against the target database:
    cd backend && python migrations/005_status_fields.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from database import engine  # noqa: E402
from sqlalchemy import text  # noqa: E402


def run() -> None:
    with engine.connect() as conn:
        # ── subcategory_meta ─────────────────────────────────────────────────
        conn.execute(text(
            "ALTER TABLE subcategory_meta ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft'"
        ))
        conn.execute(text(
            "ALTER TABLE subcategory_meta ADD COLUMN IF NOT EXISTS created_by VARCHAR"
        ))
        # Migrate: is_published=true → 'published', false → 'testing'
        conn.execute(text(
            "UPDATE subcategory_meta SET status = 'published' WHERE is_published = TRUE AND status = 'draft'"
        ))
        conn.execute(text(
            "UPDATE subcategory_meta SET status = 'testing' WHERE is_published = FALSE AND status = 'draft'"
        ))
        conn.execute(text(
            "ALTER TABLE subcategory_meta DROP COLUMN IF EXISTS is_published"
        ))

        # ── grammar_case_rule ────────────────────────────────────────────────
        conn.execute(text(
            "ALTER TABLE grammar_case_rule ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'testing'"
        ))
        # Migrate: is_published=true → 'published', false → 'testing' (already default)
        conn.execute(text(
            "UPDATE grammar_case_rule SET status = 'published' WHERE is_published = TRUE"
        ))
        conn.execute(text(
            "ALTER TABLE grammar_case_rule DROP COLUMN IF EXISTS is_published"
        ))

        # ── practice_test ────────────────────────────────────────────────────
        conn.execute(text(
            "ALTER TABLE practice_test ADD COLUMN IF NOT EXISTS status VARCHAR DEFAULT 'draft'"
        ))
        conn.execute(text(
            "ALTER TABLE practice_test ADD COLUMN IF NOT EXISTS created_by VARCHAR"
        ))
        # Migrate: is_active=true → 'published', false → 'testing'
        conn.execute(text(
            "UPDATE practice_test SET status = 'published' WHERE is_active = TRUE AND status = 'draft'"
        ))
        conn.execute(text(
            "UPDATE practice_test SET status = 'testing' WHERE is_active = FALSE AND status = 'draft'"
        ))
        conn.execute(text(
            "ALTER TABLE practice_test DROP COLUMN IF EXISTS is_active"
        ))

        conn.commit()

    print("Migration 005 complete — status fields added, is_published/is_active dropped.")


if __name__ == "__main__":
    run()
