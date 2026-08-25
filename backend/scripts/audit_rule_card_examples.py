"""Audit: a rule card must never print a word that same lesson grades as an answer.

Second invariant of ``documentation/grammar-sentence-data-integrity.md`` (found during
issue #159, closed for every noun case by plan #9). ``grammar_service.py::get_lessons()``
bundles one ``grammar_case_rule`` row with *every* sentence of that case and shows it
statically for the whole lesson, so an illustrative example that happens to be a graded
``full_word`` for the same ``case_index`` lets the learner read the answer straight off the
card instead of applying the pattern.

Invariant enforced here: no word token in ``transform || endings_sg || endings_pl`` may
equal (case-insensitively) a live ``grammar_sentence.full_word`` of the same case.

Read-only. Run: ``backend/.venv/bin/python backend/scripts/audit_rule_card_examples.py``
Exits 1 if any GUARDED case leaks. PARADIGM cases are reported but do not fail the run.
"""
import os
import re
import sys
from collections import defaultdict

import psycopg

# Noun cases: the rule is a productive suffix mapping, so an example noun can always be
# picked from the open class of nouns that the lesson does not grade. Strictly gated.
GUARDED_CASES = frozenset(range(2, 14))

# Numeral cases: the paradigm *is* the rule. Cardinals (15, 16) and collective numerals
# (20) are a closed class with no productive suffix to state -- a card that refuses to
# name ``keturios``/``dveji`` cannot teach them at all, and the exercise (which supplies
# the digit and the gender, e.g. "(4, f.)") is a form-recall drill by design. Ordinals
# (17-19) do have a productive mapping, but every ordinal the card could cite as an
# example is also a graded answer somewhere in the same 38-sentence pool. Reported as
# known, accepted overlap rather than gated -- see the doc's Invariant 2 section.
PARADIGM_CASES = frozenset(range(15, 21))

TOKEN_RE = re.compile(r"[^\W\d_]+", re.UNICODE)

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
    cases = sorted(GUARDED_CASES | PARADIGM_CASES)
    with psycopg.connect(database_url()) as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT case_index, name_ru, transform, endings_sg, endings_pl "
            "FROM grammar_case_rule WHERE case_index = ANY(%s)",
            (cases,),
        )
        rules = {
            row[0]: {"name": row[1], "card": " ".join(filter(None, row[2:]))}
            for row in cur.fetchall()
        }

        cur.execute(
            "SELECT case_index, full_word FROM grammar_sentence "
            "WHERE archived IS NOT TRUE AND case_index = ANY(%s)",
            (cases,),
        )
        pool: dict[int, set[str]] = defaultdict(set)
        for case_index, full_word in cur.fetchall():
            if full_word:
                pool[case_index].add(full_word.lower())

    leaks: dict[int, list[str]] = {}
    for case_index in cases:
        rule = rules.get(case_index)
        if rule is None:
            continue
        answers = pool[case_index]
        found = sorted({t for t in TOKEN_RE.findall(rule["card"]) if t.lower() in answers})
        if found:
            leaks[case_index] = found

    print(f"Checked {len(rules)} rule cards against {sum(len(v) for v in pool.values())} "
          f"live sentences (cases {cases[0]}-{cases[-1]}).\n")
    for case_index in sorted(leaks):
        tag = "GATE" if case_index in GUARDED_CASES else "paradigm"
        print(f"case {case_index} ({rules[case_index]['name']}) [{tag}] -- "
              f"{len(leaks[case_index])} example(s) also graded as answers:")
        for word in leaks[case_index]:
            print(f"   {word}")
        print()
    blocking = sum(len(v) for c, v in leaks.items() if c in GUARDED_CASES)
    accepted = sum(len(v) for c, v in leaks.items() if c in PARADIGM_CASES)
    print(f"guarded cases {sorted(GUARDED_CASES)}: {blocking} leaking example(s)  <- gate")
    print(f"paradigm cases {sorted(PARADIGM_CASES)}: {accepted} overlapping form(s) "
          f"(accepted -- the numeral paradigm is the rule)")
    return 1 if blocking else 0


if __name__ == "__main__":
    sys.exit(main())
