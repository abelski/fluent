"""Populate freq_rank and theme fields on all Verb rows using verb_themes.json.

Usage (from repo root):
    python backend/scripts/seed_verb_themes.py            # apply themes
    python backend/scripts/seed_verb_themes.py --dry-run  # validate only
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import engine
from models import Verb
from sqlmodel import Session, select

THEMES_FILE = Path(__file__).parent / "verb_themes.json"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    data = json.loads(THEMES_FILE.read_text())

    # Validate uniqueness in JSON
    seen_numbers = {}
    seen_ranks = {}
    errors = []
    for entry in data:
        n = entry["number"]
        r = entry["freq_rank"]
        if n in seen_numbers:
            errors.append(f"Duplicate verb number {n} (infinitive: {entry['infinitive']})")
        if r in seen_ranks:
            errors.append(f"Duplicate freq_rank {r} (verb #{n})")
        seen_numbers[n] = entry
        seen_ranks[r] = entry
    if errors:
        print("ERROR: JSON validation failed:")
        for e in errors:
            print(f"  {e}")
        sys.exit(1)

    with Session(engine) as session:
        verbs = {v.number: v for v in session.exec(select(Verb)).all()}

    missing = [e["number"] for e in data if e["number"] not in verbs]
    if missing:
        print(f"WARNING: {len(missing)} verb numbers from JSON not found in DB: {missing}")

    not_in_json = sorted(n for n in verbs if n not in seen_numbers)
    if not_in_json:
        print(f"WARNING: {len(not_in_json)} DB verbs have no theme assignment: {not_in_json}")

    print(f"JSON entries: {len(data)}  |  DB verbs: {len(verbs)}")
    themes = {}
    for e in data:
        themes.setdefault(e["theme"], 0)
        themes[e["theme"]] += 1
    for t, cnt in sorted(themes.items()):
        print(f"  {t}: {cnt}")

    if args.dry_run:
        print("Dry run — no changes made.")
        return

    updated = 0
    with Session(engine) as session:
        for entry in data:
            verb = session.exec(select(Verb).where(Verb.number == entry["number"])).first()
            if verb:
                verb.freq_rank = entry["freq_rank"]
                verb.theme = entry["theme"]
                session.add(verb)
                updated += 1
        session.commit()

    print(f"Updated {updated} verbs.")


if __name__ == "__main__":
    main()
