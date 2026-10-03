"""Add the 7 weekday words to Sėkmės list 237 «Mėnesiai» and rename it (#58a).

There is no admin endpoint that adds existing words to a curated list, hence this script.
Reuses words 3238–3244 (pirmadienis…sekmadienis); progress is per word, so nobody re-learns them.

Safety: aborts with no writes unless list 237 has subcategory 'sekmes' and every word id exists
with the expected `lithuanian`. Appends only missing words at max(position)+1…, in weekday order;
sets title/title_en only if they differ. A second run is a no-op. One transaction.

Usage (from backend/):
    .venv/bin/python scripts/add_weekdays_to_months_list.py            # report only
    .venv/bin/python scripts/add_weekdays_to_months_list.py --apply    # writes — only with explicit approval
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_backend = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_backend))

from sqlmodel import Session, func, select  # noqa: E402

from models import Word, WordList, WordListItem  # noqa: E402

LIST_ID = 237
SUBCATEGORY = "sekmes"
WEEKDAYS = {
    3238: "pirmadienis",
    3239: "antradienis",
    3240: "trečiadienis",
    3241: "ketvirtadienis",
    3242: "penktadienis",
    3243: "šeštadienis",
    3244: "sekmadienis",
}
TITLE = "Mėnesiai ir savaitės dienos"
TITLE_EN = "Months and days of the week"


class Abort(Exception):
    pass


def run(session: Session, apply: bool) -> dict[str, int]:
    """Returns counts of what was (or would be) changed. Raises Abort before any write."""
    wl = session.get(WordList, LIST_ID)
    if wl is None or wl.subcategory != SUBCATEGORY:
        raise Abort(f"list {LIST_ID} missing or subcategory != {SUBCATEGORY!r}")
    for wid, lt in WEEKDAYS.items():
        w = session.get(Word, wid)
        if w is None or w.lithuanian != lt:
            raise Abort(f"word {wid} missing or not {lt!r}")

    present = set(session.exec(select(WordListItem.word_id).where(WordListItem.word_list_id == LIST_ID)).all())
    pos = session.exec(select(func.max(WordListItem.position)).where(WordListItem.word_list_id == LIST_ID)).one() or 0
    counts = {"added": 0, "renamed": 0}
    for wid in WEEKDAYS:  # dict order = weekday order
        if wid in present:
            continue
        pos += 1
        session.add(WordListItem(word_list_id=LIST_ID, word_id=wid, position=pos))
        counts["added"] += 1
    if (wl.title, wl.title_en) != (TITLE, TITLE_EN):
        wl.title, wl.title_en = TITLE, TITLE_EN
        session.add(wl)
        counts["renamed"] = 1
    if apply:
        session.commit()
    else:
        session.rollback()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--apply", action="store_true", help="write to the DB")
    args = parser.parse_args()

    from database import engine  # the URL itself is never printed
    with Session(engine) as session:
        try:
            counts = run(session, apply=args.apply)
        except Abort as e:
            print(f"ABORTED, nothing written: {e}")
            sys.exit(1)
    print(("APPLIED" if args.apply else "REPORT ONLY (nothing written)") + f": {counts}")


if __name__ == "__main__":
    main()
