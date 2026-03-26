"""
Migration 008: Re-order word_list_item positions within each list by Lithuanian word length (shortest first).

After this migration:
- position values within each list reflect short-to-long word order
- admin panel arrow buttons continue to work (they update position values)
- study sessions serve words in position order (no runtime sort needed)

Usage:
  python backend/migrations/008_sort_positions_by_length.py [--dry-run]
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

    # Fetch all active word_list_items joined with word length
    cur.execute("""
        SELECT wli.id, wli.word_list_id, wli.position, length(w.lithuanian) AS word_len
        FROM word_list_item wli
        JOIN word w ON w.id = wli.word_id
        WHERE w.archived = FALSE
        ORDER BY wli.word_list_id, length(w.lithuanian), wli.id
    """)
    rows = cur.fetchall()

    # Group by list and assign new positions 0, 1, 2, ...
    updates: list[tuple[int, int]] = []  # (new_position, item_id)
    current_list: int | None = None
    pos = 0
    for item_id, list_id, _old_pos, _word_len in rows:
        if list_id != current_list:
            current_list = list_id
            pos = 0
        updates.append((pos, item_id))
        pos += 1

    print(f"Reordering positions for {len(updates)} word-list items across all lists.")

    if DRY_RUN:
        print("--dry-run: no changes written.")
        conn.close()
        return

    # Batch update using a single VALUES expression
    values = ",".join(f"({new_pos},{item_id})" for new_pos, item_id in updates)
    cur.execute(f"""
        UPDATE word_list_item AS wli
        SET position = v.new_pos
        FROM (VALUES {values}) AS v(new_pos, id)
        WHERE wli.id = v.id
    """)
    conn.commit()
    print(f"Done. Updated {len(updates)} positions.")
    conn.close()


if __name__ == '__main__':
    main()
