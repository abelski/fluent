"""Fill practice_test.section_ru/section_en/is_final and article.theme (#55).

Data: data/en_content/practice_sections_article_themes.json — one row per target, keyed by
natural keys (practice test `title_ru`, article `slug`), never ids.

Rules: only EMPTY fields are filled (section NULL, is_final false, theme NULL), so re-running
is a no-op and admin edits are never overwritten. A key that matches no row aborts the whole
run before anything is written. One transaction.

Usage (from backend/):
    .venv/bin/python scripts/fill_practice_sections_article_themes.py            # = --dry-run: report only
    .venv/bin/python scripts/fill_practice_sections_article_themes.py --apply    # writes — only with explicit approval
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_backend = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_backend))

from sqlmodel import Session, select  # noqa: E402

from models import Article, PracticeTest  # noqa: E402

DATA_PATH = _backend / "data" / "en_content" / "practice_sections_article_themes.json"


class UnmatchedKeys(Exception):
    pass


def _load(path: Path) -> list[dict]:
    return json.loads(path.read_text(encoding="utf-8"))


def run(session: Session, apply: bool, path: Path = DATA_PATH) -> dict[str, int]:
    """Returns counts of fields that were (or would be) filled. Raises UnmatchedKeys first."""
    rows = _load(path)
    tests = {t.title_ru: t for t in session.exec(select(PracticeTest)).all()}
    articles = {a.slug: a for a in session.exec(select(Article)).all()}

    missing = [r.get("title_ru") for r in rows if r["table"] == "practice_test" and r["title_ru"] not in tests]
    missing += [r.get("slug") for r in rows if r["table"] == "article" and r["slug"] not in articles]
    if missing:
        raise UnmatchedKeys(f"{len(missing)} key(s) match no row: {missing}")

    counts = {"section_ru": 0, "section_en": 0, "is_final": 0, "theme": 0, "kept": 0}
    for r in rows:
        target = tests[r["title_ru"]] if r["table"] == "practice_test" else articles[r["slug"]]
        wanted = {k: v for k, v in r.items() if k in ("section_ru", "section_en", "is_final", "theme")}
        for field, value in wanted.items():
            if getattr(target, field):  # already set (or is_final already true) — never overwrite
                counts["kept"] += 1
                continue
            if not value:
                continue
            counts[field] += 1
            setattr(target, field, value)
        session.add(target)
    if apply:
        session.commit()
    else:
        session.rollback()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="report only (default)")
    mode.add_argument("--apply", action="store_true", help="write to the DB")
    args = parser.parse_args()

    from database import engine  # the URL itself is never printed
    with Session(engine) as session:
        try:
            counts = run(session, apply=args.apply)
        except UnmatchedKeys as e:
            print(f"ABORTED, nothing written: {e}")
            sys.exit(1)
    print(("APPLIED" if args.apply else "DRY RUN (nothing written)") + ":")
    for field, n in counts.items():
        print(f"  {field:<11} {n}")


if __name__ == "__main__":
    main()
