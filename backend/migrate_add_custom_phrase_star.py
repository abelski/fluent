"""Migration: add star column to custom_phrase table.

Star is the phrase complexity (1-3) used to filter study sessions by level,
mirroring Word.star for word lists. Backfilled from word count:
<=3 words = 1, 4-6 words = 2, 7+ words = 3.

Safe to re-run — uses IF NOT EXISTS and only backfills the default value.

Run from the backend directory:
    python migrate_add_custom_phrase_star.py
"""

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from database import engine


def main():
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE custom_phrase ADD COLUMN IF NOT EXISTS star INTEGER NOT NULL DEFAULT 1;"
        ))
        conn.execute(text(
            """
            UPDATE custom_phrase SET star = CASE
                WHEN array_length(string_to_array(trim(text), ' '), 1) <= 3 THEN 1
                WHEN array_length(string_to_array(trim(text), ' '), 1) <= 6 THEN 2
                ELSE 3
            END
            WHERE star = 1;
            """
        ))
        conn.commit()
        counts = conn.execute(text(
            "SELECT star, count(*) FROM custom_phrase GROUP BY star ORDER BY star;"
        )).fetchall()
        print("custom_phrase star distribution:", counts)


if __name__ == "__main__":
    main()
