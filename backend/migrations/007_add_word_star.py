"""
Migration 007: Add `star` complexity column to the word table.

Star semantics:
  1 = infinitive / base dictionary form  (e.g. apsipirkti, namas)
  2 = conjugated/inflected form, or multiple forms in one field  (e.g. apsiperka, apsipirko)
  3 = multi-word phrase  (e.g. matavimosi kabinos)

Classification rules (applied in order):
  1. contains space          → 3  (phrase)
  2. contains , or /         → 2  (multiple forms listed)
  3. hint = 'veiksmažodis' AND ends in -ti or -tis → 1  (verb infinitive)
  4. hint = 'veiksmažodis'   → 2  (conjugated verb form)
  5. everything else         → 1  (noun/adjective base form)

Usage:
  python backend/migrations/007_add_word_star.py [--dry-run]
"""

import os
import sys

import psycopg2

DRY_RUN = '--dry-run' in sys.argv

DATABASE_URL = os.environ.get('DATABASE_URL')
if not DATABASE_URL:
    print("ERROR: DATABASE_URL env var not set")
    sys.exit(1)


def classify(lithuanian: str, hint: str | None) -> int:
    if ' ' in lithuanian:
        return 3
    if ',' in lithuanian or '/' in lithuanian:
        return 2
    if hint == 'veiksmažodis':
        return 1 if (lithuanian.endswith('ti') or lithuanian.endswith('tis')) else 2
    return 1


def main():
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("Adding star column...")
    cur.execute("""
        ALTER TABLE word
        ADD COLUMN IF NOT EXISTS star INTEGER NOT NULL DEFAULT 1
    """)
    conn.commit()
    print("Column ready.")

    cur.execute("SELECT id, lithuanian, hint FROM word WHERE archived = FALSE ORDER BY id")
    rows = cur.fetchall()
    print(f"Fetched {len(rows)} words.")

    counts = {1: 0, 2: 0, 3: 0}
    assignments: dict[int, int] = {}

    for word_id, lithuanian, hint in rows:
        star = classify(lithuanian, hint)
        assignments[word_id] = star
        counts[star] += 1

    print(f"Classification: ★={counts[1]} base forms, ★★={counts[2]} inflected/multi-form, ★★★={counts[3]} phrases")

    if DRY_RUN:
        print("\n--dry-run: no changes written to DB.")
        conn.close()
        return

    print("Writing to database...")
    for word_id, star in assignments.items():
        cur.execute("UPDATE word SET star = %s WHERE id = %s", (star, word_id))
    conn.commit()
    print(f"Done. Updated {len(assignments)} words.")
    conn.close()


if __name__ == '__main__':
    main()
