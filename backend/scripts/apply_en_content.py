"""Fill the EN twins of admin-authored content (#48b).

Sources (see documentation/en-content.md):
  - seed files, parsed with `ast` so nothing is executed:
      data/constitution/program_data.json        practice_test.description_en   (category 1, by sort_order)
      routers/grammar.py `_SEED_PROGRAMS`         grammar_program.description_en (by title)
      scripts/seed_verbs_grammar.py `PROGRAMS`    grammar_program.description_en (by title)
      scripts/seed_numbers_grammar.py `CASE_RULES` grammar_case_rule.*_en         (by case_index)
      scripts/seed_numbers_grammar.py `SENTENCES`  grammar_sentence.english       (by case_index, display, russian)
      scripts/verb_translations_en.py             verb.translation_en            (by stress-stripped infinitive)
  - data/en_content/*.json for rows that exist only in the DB (same match keys, never ids —
    except practice_category, whose two rows are stable).

Rules: only EMPTY EN fields are filled, so re-running is a no-op and admin edits are never
overwritten. A key that matches no row is an error (the whole run aborts before writing).

Usage (from backend/):
    .venv/bin/python scripts/apply_en_content.py            # = --dry-run: writes review.html, no DB writes
    .venv/bin/python scripts/apply_en_content.py --apply    # writes to the DB — only with explicit approval
"""

from __future__ import annotations

import argparse
import ast
import html
import json
import random
import re
import sys
import unicodedata
from dataclasses import dataclass
from pathlib import Path

_backend = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_backend))

from sqlmodel import Session, select  # noqa: E402

from models import (  # noqa: E402
    GrammarCaseRule, GrammarProgram, GrammarSentence, PracticeCategory, PracticeTest, Verb, WordList,
)

EN_DIR = _backend / "data" / "en_content"
REVIEW_PATH = _backend.parent / "temp_files" / "screenshots" / "plan_48b_en-db-content" / "review.html"
RULE_FIELDS = ("name", "question", "usage", "transform", "endings_sg", "endings_pl")
_CYRILLIC = re.compile(r"[Ѐ-ӿ]")
_STRESS_MARKS = frozenset("́̀̃")  # acute, grave, tilde — same set as seed_verb_programs.py


def verb_key(infinitive: str) -> str:
    """Infinitive without stress marks: keeps ogonek, ė's dot, caron and macron."""
    nfd = unicodedata.normalize("NFD", infinitive)
    return unicodedata.normalize("NFC", "".join(c for c in nfd if c not in _STRESS_MARKS)).strip().lower()


def _literal(path: Path, name: str):
    """A module-level literal (list/dict) from a .py file, without importing it."""
    for node in ast.parse(path.read_text(encoding="utf-8")).body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == name for t in node.targets):
            return ast.literal_eval(node.value)
    raise KeyError(f"{name} not found in {path}")


def _json(name: str):
    return json.loads((EN_DIR / name).read_text(encoding="utf-8"))


# ── Collect ───────────────────────────────────────────────────────────────────

@dataclass
class Fill:
    table: str
    key: str          # human-readable match key (for the report / review)
    row: object       # ORM row to write to
    field: str        # EN column
    ru: str | None    # the RU twin (what EN translates)
    lt: str           # LT source shown in the review, if any
    en: str


class UnmatchedKeys(Exception):
    pass


def collect(session: Session) -> tuple[list[Fill], list[str]]:
    """Every empty EN field that a source can fill, plus the list of unmatched keys."""
    fills: list[Fill] = []
    unmatched: list[str] = []

    def add(table, key, rows, pairs, lt=""):
        """pairs: [(en_field, ru_field, value)]; rows: every DB row matching the key."""
        if not rows:
            unmatched.append(f"{table}: {key}")
            return
        for row in rows:
            for en_field, ru_field, value in pairs:
                if value and not (getattr(row, en_field) or "").strip():
                    fills.append(Fill(table, key, row, en_field, getattr(row, ru_field), lt, value.strip()))

    # practice_test — constitution program, category 1 by sort_order
    tests = {t.sort_order: t for t in session.exec(select(PracticeTest).where(PracticeTest.category_id == 1)).all()}
    for e in json.loads((_backend / "data" / "constitution" / "program_data.json").read_text(encoding="utf-8")):
        t = tests.get(e["sort_order"])
        add("practice_test", f"category 1 / sort_order {e['sort_order']}", [t] if t else [],
            [("description_en", "description_ru", e.get("description_en"))], lt=e.get("description_ru", ""))

    # practice_category — by id (two stable rows)
    cats = {c.id: c for c in session.exec(select(PracticeCategory)).all()}
    for e in _json("practice_categories.json"):
        c = cats.get(e["id"])
        add("practice_category", f"id {e['id']}", [c] if c else [],
            [("description_en", "description_ru", e.get("description_en"))])

    # grammar_program — by title
    programs = session.exec(select(GrammarProgram)).all()
    seed_programs = (_literal(_backend / "routers" / "grammar.py", "_SEED_PROGRAMS")
                     + _literal(_backend / "scripts" / "seed_verbs_grammar.py", "PROGRAMS"))
    for e in seed_programs:
        add("grammar_program", e["title"], [p for p in programs if p.title == e["title"]],
            [("description_en", "description", e.get("description_en"))])

    # grammar_case_rule — by case_index
    rules = session.exec(select(GrammarCaseRule)).all()
    rule_sources = _literal(_backend / "scripts" / "seed_numbers_grammar.py", "CASE_RULES") + _json("grammar_case_rules.json")
    for e in rule_sources:
        pairs = [(f"{f}_en", "name_ru" if f == "name" else f, e.get(f"{f}_en")) for f in RULE_FIELDS]
        add("grammar_case_rule", f"case {e['case_index']}", [r for r in rules if r.case_index == e["case_index"]], pairs)

    # grammar_sentence — by (case_index, display, russian); duplicates all get the same EN
    by_key: dict[tuple, list] = {}
    for s in session.exec(select(GrammarSentence)).all():
        by_key.setdefault((s.case_index, s.display, s.russian), []).append(s)
    seed_sentences = [
        {"case_index": ci, "display": d, "russian": ru, "english": en, "full_word": fw}
        for ci, d, _ending, fw, ru, en in _literal(_backend / "scripts" / "seed_numbers_grammar.py", "SENTENCES")
    ]
    for e in seed_sentences + _json("grammar_sentences.json"):
        rows = by_key.get((e["case_index"], e["display"], e["russian"]), [])
        full_word = e.get("full_word") or (rows[0].full_word if rows else "")
        add("grammar_sentence", f"case {e['case_index']}: {e['display']}", rows,
            [("english", "russian", e["english"])], lt=f"{e['display']}  [{full_word}]")

    # word_list — by (subcategory, title)
    lists = session.exec(select(WordList)).all()
    for e in _json("word_lists.json"):
        add("word_list", f"{e['subcategory']}: {e['title']}",
            [w for w in lists if w.subcategory == e["subcategory"] and w.title == e["title"]],
            [("title_en", "title", e.get("title_en")), ("description_en", "description", e.get("description_en"))],
            lt=e["title"] if e["subcategory"] == "sekmes" else "")

    # verb — by stress-stripped infinitive; en_content/verbs.json splits homographs by translation_ru
    sys.path.insert(0, str(_backend / "scripts"))
    from verb_translations_en import TRANSLATIONS
    verbs_by_key: dict[str, list] = {}
    for v in session.exec(select(Verb)).all():
        verbs_by_key.setdefault(verb_key(v.infinitive), []).append(v)
    overrides = {(verb_key(e["infinitive"]), e["translation_ru"]): e["translation_en"] for e in _json("verbs.json")}
    override_keys = {k for k, _ in overrides}
    for e in _json("verbs.json"):
        rows = [v for v in verbs_by_key.get(verb_key(e["infinitive"]), []) if v.translation_ru == e["translation_ru"]]
        add("verb", f"{e['infinitive']} ({e['translation_ru']})", rows,
            [("translation_en", "translation_ru", e["translation_en"])], lt=e["infinitive"])
    for inf, en in TRANSLATIONS.items():
        k = verb_key(inf)
        if k in override_keys:
            continue
        rows = verbs_by_key.get(k, [])
        if len(rows) > 1:
            unmatched.append(f"verb: {inf} matches {len(rows)} rows — split it in en_content/verbs.json")
            continue
        add("verb", inf, rows, [("translation_en", "translation_ru", en)], lt=inf)

    return fills, unmatched


def category_rename(session: Session) -> PracticeCategory | None:
    """Category 2's name_en is the LT word «Skaitymas»; rename it, guarded by the old value."""
    c = session.get(PracticeCategory, 2)
    return c if c is not None and c.name_en == "Skaitymas" else None


# ── Review ────────────────────────────────────────────────────────────────────

_RISK_ORDER = ["grammar_case_rule", "grammar_program", "practice_category", "practice_test", "word_list"]


def flags(f: Fill) -> list[str]:
    out = []
    if not f.en.strip():
        out.append("EN empty")
    if _CYRILLIC.search(f.en):
        out.append("Cyrillic in EN")
    ru = f.ru or ""
    if ru.count("(") > f.en.count("("):
        out.append("bracket qualifier lost")
    if len(ru) >= 15 and not 0.5 <= len(f.en) / len(ru) <= 2.0:
        out.append(f"length ratio {len(f.en) / len(ru):.2f}")
    return out


def review_rows(fills: list[Fill], seed: int = 48) -> list[Fill]:
    """Every rule/program/category/test/word-list fill, then a random 10% of sentences and verbs."""
    rows = [f for t in _RISK_ORDER for f in fills if f.table == t]
    rng = random.Random(seed)
    for t in ("grammar_sentence", "verb"):
        pool = [f for f in fills if f.table == t]
        rows += rng.sample(pool, max(1, len(pool) // 10)) if pool else []
    return rows


def write_review(fills: list[Fill], rename: bool, path: Path = REVIEW_PATH) -> None:
    rows = review_rows(fills)
    flagged = sum(1 for f in rows if flags(f))
    esc = lambda s: html.escape(s or "")
    body = "".join(
        f"<tr class=\"{'flag' if flags(f) else ''}\"><td>{esc(f.table)}</td><td>{esc(f.key)}</td><td>{esc(f.field)}</td>"
        f"<td>{esc(f.lt)}</td><td>{esc(f.ru)}</td><td>{esc(f.en)}</td><td>{esc(', '.join(flags(f)))}</td></tr>"
        for f in rows
    )
    counts = ", ".join(f"{t}: {n}" for t, n in count_by_table(fills).items()) or "nothing to fill"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"""<!doctype html><meta charset="utf-8"><title>#48b EN content review</title>
<style>body{{font:13px Inter,system-ui,sans-serif;margin:24px}}table{{border-collapse:collapse;width:100%}}
td,th{{border:1px solid #ddd;padding:4px 6px;vertical-align:top;text-align:left}}th{{background:#f5f5f5;position:sticky;top:0}}
tr.flag td{{background:#fff4e5}}</style>
<h1>#48b — EN content review (dry run)</h1>
<p>Fields to fill: {len(fills)} ({counts}). Category 2 rename «Skaitymas» → «Reading»: {"pending" if rename else "not needed"}.</p>
<p>Shown: {len(rows)} rows — every rule, program, category, test and word-list field, plus a random 10% of sentences and verbs. Flagged: {flagged}.</p>
<table><tr><th>table</th><th>key</th><th>field</th><th>LT source</th><th>RU</th><th>proposed EN</th><th>pre-check</th></tr>{body}</table>
""", encoding="utf-8")


def count_by_table(fills: list[Fill]) -> dict[str, int]:
    out: dict[str, int] = {}
    for f in fills:
        out[f.table] = out.get(f.table, 0) + 1
    return out


# ── Run ───────────────────────────────────────────────────────────────────────

def run(session: Session, apply: bool, review_path: Path | None = REVIEW_PATH) -> dict[str, int]:
    """Collect, (optionally) write, return fill counts per table. Raises UnmatchedKeys first."""
    fills, unmatched = collect(session)
    if unmatched:
        raise UnmatchedKeys("keys matching no DB row:\n  " + "\n  ".join(unmatched))
    rename = category_rename(session)
    if review_path is not None:
        write_review(fills, rename is not None, review_path)
    counts = count_by_table(fills)
    if rename is not None:
        counts["practice_category (rename)"] = 1
    if apply:
        for f in fills:
            setattr(f.row, f.field, f.en)
            session.add(f.row)
        if rename is not None:
            rename.name_en = "Reading"
            session.add(rename)
        session.commit()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="default: write review.html only")
    mode.add_argument("--apply", action="store_true", help="write the EN fields to the DB")
    args = parser.parse_args()

    from database import engine  # the URL itself is never printed
    with Session(engine) as session:
        try:
            counts = run(session, apply=args.apply)
        except UnmatchedKeys as exc:
            print(f"ERROR: {exc}", file=sys.stderr)
            sys.exit(1)
    verb = "Applied" if args.apply else "Would fill (dry run)"
    print(f"{verb}: {sum(v for k, v in counts.items() if 'rename' not in k)} fields")
    for table, n in counts.items():
        print(f"  {table}: {n}")
    if not args.apply:
        print(f"Review: {REVIEW_PATH}")


if __name__ == "__main__":
    main()
