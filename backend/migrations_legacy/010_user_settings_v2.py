"""
Migration 010: Replace split new/review session settings with a single total + ratio.

Drops:
  new_words_per_session   INTEGER
  review_words_per_session INTEGER

Adds:
  words_per_session  INTEGER   -- total words per session (NULL → default 10)
  new_words_ratio    FLOAT     -- fraction of new words 0.0–1.0 (NULL → default 0.7)

Usage:
  python backend/migrations/010_user_settings_v2.py [--dry-run]
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

    print("Dropping old session setting columns...")
    cur.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS new_words_per_session')
    cur.execute('ALTER TABLE "user" DROP COLUMN IF EXISTS review_words_per_session')

    print("Adding new session setting columns...")
    cur.execute('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS words_per_session INTEGER')
    cur.execute('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS new_words_ratio FLOAT')

    if DRY_RUN:
        print("--dry-run: rolling back.")
        conn.rollback()
    else:
        conn.commit()
        print("Done. Old columns dropped, new columns added (NULL = use defaults 10 / 0.7).")

    conn.close()


if __name__ == '__main__':
    main()
