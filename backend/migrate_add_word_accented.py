"""Migration: add accented column to word table.

Stores the Lithuanian word with the stressed syllable wrapped in asterisks,
e.g. "apsi*pir*ko". Null means no stress data yet — frontend falls back to
the plain `lithuanian` field.

Safe to re-run — uses IF NOT EXISTS.

Run from the backend directory:
    python migrate_add_word_accented.py
"""

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from database import engine


def main():
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE word ADD COLUMN IF NOT EXISTS accented VARCHAR;"
        ))
        conn.commit()
    print("Done: accented column added to word table.")


if __name__ == "__main__":
    main()
