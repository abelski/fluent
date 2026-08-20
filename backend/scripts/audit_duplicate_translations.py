"""Audit: distinct Lithuanian lemmas that share one translation.

Feature #5. Two different lemmas with an identical translation ("kalbėti"/"sakyti" ->
«говорить») are indistinguishable the moment a session asks the learner to *produce*
the Lithuanian — reverse MC, assemble, type. The session builder now de-duplicates on
translation server-side (`_dedupe_by_translation` in ``backend/routers/words.py``), so
such a pair can no longer meet inside one queue; this script reports the underlying
content debt so the collisions can be resolved in the data too, by adding parenthetical
qualifiers the way issue #152 did («коллега (по работе)» vs «коллега (по профессии)»).

Collision key = the *displayed* translation, whitespace-collapsed and case-folded, with
``translation_ru`` and ``translation_en`` treated as separate keys. Parentheses are
deliberately NOT stripped — that is what makes the issue #152 qualifiers work.

Groups whose members share a word list are flagged: those can already land in one list
study session, whereas the rest are only reachable from a cross-list review session.

Read-only, informational. Always exits 0.
Run: ``backend/.venv/bin/python backend/scripts/audit_duplicate_translations.py``
"""
import os
import sys
from collections import defaultdict

import psycopg

ENV_PATH = os.path.join(os.path.dirname(__file__), "..", ".env")


def database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if url:
        return url
    with open(ENV_PATH, encoding="utf-8") as fh:
        for line in fh:
            if line.startswith("DATABASE_URL="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("DATABASE_URL not found in environment or backend/.env")


def norm(value: str | None) -> str:
    """Whitespace-collapsed, case-folded translation. Parentheses kept on purpose."""
    return " ".join((value or "").split()).casefold()


def main() -> int:
    with psycopg.connect(database_url()) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT id, lithuanian, translation_ru, translation_en "
            "FROM word WHERE archived IS NOT TRUE ORDER BY id"
        )
        words = {
            row[0]: {"lithuanian": row[1], "ru": row[2], "en": row[3]}
            for row in cur.fetchall()
        }

        cur.execute(
            "SELECT wli.word_id, wli.word_list_id, wl.title "
            "FROM word_list_item wli JOIN word_list wl ON wl.id = wli.word_list_id "
            "WHERE wl.archived IS NOT TRUE"
        )
        lists_of: dict[int, dict[int, str]] = defaultdict(dict)
        for word_id, list_id, title in cur.fetchall():
            lists_of[word_id][list_id] = title

    total_same_list = 0
    for field, label in (("ru", "translation_ru"), ("en", "translation_en")):
        groups: dict[str, list[int]] = defaultdict(list)
        for word_id, w in words.items():
            key = norm(w[field])
            if key:
                groups[key].append(word_id)

        # A collision only matters when the *lemmas* differ — the same lemma stored twice
        # is a duplicate-row problem, not an ambiguity the learner can hit.
        collisions = {
            key: ids
            for key, ids in groups.items()
            if len({norm(words[i]["lithuanian"]) for i in ids}) > 1
        }

        same_list: list[tuple[str, list[int], int, str]] = []
        for key, ids in collisions.items():
            by_list: dict[int, list[int]] = defaultdict(list)
            for word_id in ids:
                for list_id in lists_of.get(word_id, {}):
                    by_list[list_id].append(word_id)
            for list_id, members in by_list.items():
                if len({norm(words[i]["lithuanian"]) for i in members}) > 1:
                    title = lists_of[members[0]][list_id]
                    same_list.append((key, sorted(members), list_id, title))

        covered = sum(len(ids) for ids in collisions.values())
        print(f"=== {label}: {len(collisions)} groups covering {covered} words ===\n")
        for key in sorted(collisions):
            ids = sorted(collisions[key])
            lemmas = " | ".join(words[i]["lithuanian"] for i in ids)
            print(f"  {key!r:<40} {lemmas}   ids={ids}")

        print(f"\n--- {label}: {len(same_list)} of those sit inside a single list ---")
        for key, members, list_id, title in sorted(same_list, key=lambda r: r[2]):
            lemmas = " | ".join(words[i]["lithuanian"] for i in members)
            print(f"  list {list_id} «{title}»  {key!r}  {lemmas}")
        print()
        total_same_list += len(same_list)

    print(f"Checked {len(words)} active words. Same-list collisions across both "
          f"languages: {total_same_list}.")
    print("Informational only — session-level de-duplication already prevents these "
          "from queueing together.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
