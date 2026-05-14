"""Seed script: populate the `verb` table from temp_files/verbs_extracted.json.

Usage (from repo root):
    python backend/scripts/seed_verbs_db.py             # insert / update
    python backend/scripts/seed_verbs_db.py --reset     # delete all & reinsert
    python backend/scripts/seed_verbs_db.py --dry-run   # show counts, no DB changes
"""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import engine
from models import Verb
from sqlmodel import Session, select


JSON_PATH = Path("temp_files/verbs_extracted.json")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Delete all verb rows before inserting")
    parser.add_argument("--dry-run", action="store_true", help="Count only, no DB changes")
    args = parser.parse_args()

    if not JSON_PATH.exists():
        print(f"ERROR: {JSON_PATH} not found. Run extract_verbs_pdf.py first.", file=sys.stderr)
        sys.exit(1)

    raw = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    verbs = [v for v in raw if v.get("infinitive")]  # skip parse-error placeholders

    print(f"Loaded {len(verbs)} verbs from JSON (skipped {len(raw) - len(verbs)} empty entries)")

    if args.dry_run:
        print("Dry-run: no DB changes.")
        return

    with Session(engine) as session:
        if args.reset:
            existing = session.exec(select(Verb)).all()
            for v in existing:
                session.delete(v)
            session.commit()
            print(f"Deleted {len(existing)} existing verb rows.")

        inserted = updated = skipped = 0

        for data in verbs:
            existing = session.exec(
                select(Verb).where(Verb.number == data["number"])
            ).first()

            conjugations_json = json.dumps(data.get("conjugations", {}), ensure_ascii=False)
            case_governance_json = json.dumps(data.get("case_governance", []), ensure_ascii=False)
            prefix_forms_json = json.dumps(data.get("prefix_forms", []), ensure_ascii=False)
            non_conjugated_json = json.dumps(data.get("non_conjugated", {}), ensure_ascii=False)

            if existing:
                existing.infinitive = data["infinitive"]
                existing.present_3p = data["present_3p"]
                existing.past_3p = data["past_3p"]
                existing.translation_ru = data["translation_ru"]
                existing.is_reflexive = data.get("is_reflexive", False)
                existing.conjugations = conjugations_json
                existing.case_governance = case_governance_json
                existing.prefix_forms = prefix_forms_json
                existing.non_conjugated = non_conjugated_json
                session.add(existing)
                updated += 1
            else:
                verb_row = Verb(
                    number=data["number"],
                    infinitive=data["infinitive"],
                    present_3p=data["present_3p"],
                    past_3p=data["past_3p"],
                    translation_ru=data["translation_ru"],
                    is_reflexive=data.get("is_reflexive", False),
                    conjugations=conjugations_json,
                    case_governance=case_governance_json,
                    prefix_forms=prefix_forms_json,
                    non_conjugated=non_conjugated_json,
                )
                session.add(verb_row)
                inserted += 1

        session.commit()

    print(f"Done: {inserted} inserted, {updated} updated, {skipped} skipped")


if __name__ == "__main__":
    main()
