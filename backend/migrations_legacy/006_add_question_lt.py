"""Migration 006: Add question_lt (Lithuanian) field to practice_question.

Run once against the target database:
    cd backend && python migrations/006_add_question_lt.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from database import engine  # noqa: E402
from sqlalchemy import text  # noqa: E402


def run() -> None:
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE practice_question ADD COLUMN IF NOT EXISTS question_lt VARCHAR"
        ))
        conn.commit()

    print("Migration 006 complete — question_lt added to practice_question.")


if __name__ == "__main__":
    run()
