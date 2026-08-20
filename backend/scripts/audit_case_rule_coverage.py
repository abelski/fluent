"""Audit: every ending a learner must type is derivable from the rule card.

Issue #158. The grammar exercise shows a bare stem (``profesor___``) and grades the
*stem-relative* ending the learner types, but ``grammar_case_rule.transform`` was written
in terms of *nominative* endings for declensions I-III only. Where the two disagree the
rule card does not merely omit a form, it actively mispredicts one.

Invariant enforced here: for every live ``grammar_sentence``, its ``answer_ending`` must
appear somewhere in its case's ``transform || endings_sg || endings_pl``.

Read-only. Run: ``backend/.venv/bin/python backend/scripts/audit_case_rule_coverage.py``
Exits 1 if any uncovered ending is found in a GUARDED case (outside ALLOWLIST). Uncovered
endings in DEFERRED cases are reported as known debt but do not fail the run.
"""
import os
import re
import sys
from collections import defaultdict

import psycopg

# Sentence ids whose display truncates the stem mid-cluster, so the expected answer is not
# expressible as an ending mapping at all. Not a rule-card defect -- see issue #135 / #52.
ALLOWLIST = {203: "šį"}  # "Jonas neša krep___." -> šį

# Cases whose rule cards are guaranteed to satisfy the invariant. Issue #158 fixed the
# reported case (5); the same I-III-only gap exists in the cases listed in DEFERRED and is
# scheduled for a follow-up, so those are reported but do not fail the run. Move a case
# from DEFERRED to GUARDED in the same change that fixes its rule card.
GUARDED_CASES = {5}
DEFERRED_CASES = {2, 3, 4, 6, 7, 8, 9, 13}

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


def main() -> int:
    with psycopg.connect(database_url()) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT case_index, name_ru, transform, endings_sg, endings_pl "
            "FROM grammar_case_rule WHERE case_index BETWEEN 1 AND 14"
        )
        rules = {
            row[0]: {
                "name": row[1],
                "haystack": " ".join(filter(None, row[2:])).lower(),
            }
            for row in cur.fetchall()
        }

        cur.execute(
            "SELECT id, case_index, display, answer_ending, full_word FROM grammar_sentence "
            "WHERE archived IS NOT TRUE AND case_index BETWEEN 1 AND 14 ORDER BY case_index, id"
        )
        rows = cur.fetchall()

    uncovered: dict[int, list] = defaultdict(list)
    allowlisted = []
    for sid, case_index, display, ending, full_word in rows:
        rule = rules.get(case_index)
        if rule is None:
            uncovered[case_index].append((sid, ending, display, "NO RULE ROW"))
            continue
        if not ending:
            continue
        if ending.lower() in rule["haystack"]:
            continue
        if ALLOWLIST.get(sid) == ending:
            allowlisted.append((sid, case_index, ending, display))
            continue
        uncovered[case_index].append((sid, ending, display, full_word))

    print(f"Checked {len(rows)} live sentences across {len(rules)} rule rows (cases 1-14).\n")
    if uncovered:
        for case_index in sorted(uncovered):
            name = rules.get(case_index, {}).get("name", "?")
            tag = "GATE" if case_index in GUARDED_CASES else "deferred"
            print(f"case {case_index} ({name}) [{tag}] -- {len(uncovered[case_index])} uncovered:")
            for sid, ending, display, full_word in uncovered[case_index]:
                print(f"   id {sid:>4}  ending {ending!r:<10} {display}   [{full_word}]")
            print()
    blocking = sum(len(v) for c, v in uncovered.items() if c in GUARDED_CASES)
    known_debt = sum(len(v) for c, v in uncovered.items() if c not in GUARDED_CASES)
    for sid, case_index, ending, display in allowlisted:
        print(f"allowlisted: id {sid} (case {case_index}) {ending!r} -- {display}")
    print(f"\nguarded cases {sorted(GUARDED_CASES)}: {blocking} uncovered  <- gate")
    print(f"deferred cases {sorted(DEFERRED_CASES)}: {known_debt} uncovered (known debt, "
          f"tracked as the issue #158 follow-up)")
    print(f"allowlisted: {len(allowlisted)}")
    return 1 if blocking else 0


if __name__ == "__main__":
    sys.exit(main())
