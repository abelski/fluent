"""
Migration 009: Add per-user session size settings to the user table.

new_words_per_session: how many new (unseen) words to include per study session (default 5 when null)
review_words_per_session: how many already-seen (learning/known) words to include per study session (default 5 when null)

Usage:
  python backend/migrations/009_user_settings.py [--dry-run]
"""

import os
import sys

import psycopg2

DRY_RUN = '--dry-run' in sys.argv

DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print("ERROR: DATABASE_URL env var not set")
    sys.exit(1)


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("Adding new_words_per_session and review_words_per_session columns to user table...")
    cur.execute("""
        ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS new_words_per_session INTEGER
    """)
    cur.execute("""
        ALTER TABLE "user"
        ADD COLUMN IF NOT EXISTS review_words_per_session INTEGER
    """)

    if DRY_RUN:
        print("--dry-run: rolling back.")
        conn.rollback()
    else:
        conn.commit()
        print("Done. Columns added (existing users will use defaults of 5/5).")

    conn.close()


if __name__ == '__main__':
    main()
