"""
Migration 011: Add SM-2 spaced-repetition fields to user_word_progress.

Adds:
  sm2_reps     INTEGER  DEFAULT 0      -- consecutive successful SM-2 reviews
  ease_factor  FLOAT    DEFAULT 2.5    -- SM-2 ease factor
  interval     INTEGER  DEFAULT 0      -- days until next review
  next_review  DATE     DEFAULT NULL   -- scheduled review date

Usage:
  DATABASE_URL=... python backend/migrations_legacy/011_sm2_fields.py [--dry-run]
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

    print("Adding SM-2 columns to user_word_progress...")
    cur.execute('ALTER TABLE user_word_progress ADD COLUMN IF NOT EXISTS sm2_reps INTEGER NOT NULL DEFAULT 0')
    cur.execute('ALTER TABLE user_word_progress ADD COLUMN IF NOT EXISTS ease_factor FLOAT NOT NULL DEFAULT 2.5')
    cur.execute('ALTER TABLE user_word_progress ADD COLUMN IF NOT EXISTS interval INTEGER NOT NULL DEFAULT 0')
    cur.execute('ALTER TABLE user_word_progress ADD COLUMN IF NOT EXISTS next_review DATE DEFAULT NULL')

    if DRY_RUN:
        print("--dry-run: rolling back.")
        conn.rollback()
    else:
        conn.commit()
        print("Done. SM-2 columns added (existing rows default to reps=0, ef=2.5, interval=0, next_review=NULL).")

    conn.close()


if __name__ == '__main__':
    main()
