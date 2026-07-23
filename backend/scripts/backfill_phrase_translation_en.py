"""Backfill `phrase.translation_en` for the Sékmės! A1.1 program (issue #148).

Program 11 was seeded without any English translations, so English-language users
silently saw the Russian text. This script fills the gap from the committed
translation module.

UPDATE-only and idempotent — it never inserts or deletes. Do NOT use
`backend/seed_phrases.py` for this: its main() deletes every PhraseProgram along
with all Phrase, UserPhraseProgress and UserPhraseProgramEnrollment rows, which
would wipe every user's phrase progress.

Run from the backend/ directory:
    .venv/bin/python -m scripts.backfill_phrase_translation_en [--dry-run]
"""

import sys

from dotenv import load_dotenv

load_dotenv()

from sqlmodel import Session, select  # noqa: E402

from database import engine  # noqa: E402
from models import Phrase  # noqa: E402
from scripts.phrase_translations_en_a11 import TRANSLATIONS  # noqa: E402

PROGRAM_ID = 11


def main(dry_run: bool = False) -> int:
    with Session(engine) as session:
        phrases = session.exec(
            select(Phrase).where(Phrase.program_id == PROGRAM_ID)
        ).all()

        if not phrases:
            print(f"No phrases found for program_id={PROGRAM_ID}. Nothing to do.")
            return 1

        updated = 0
        skipped = 0
        missing: list[str] = []

        for phrase in phrases:
            if phrase.translation_en:
                skipped += 1
                continue
            english = TRANSLATIONS.get(phrase.text)
            if not english:
                missing.append(phrase.text)
                continue
            phrase.translation_en = english
            session.add(phrase)
            updated += 1

        if missing:
            print(f"ERROR: {len(missing)} phrase(s) have no translation entry:")
            for text in missing:
                print(f"  - {text}")
            print("\nAborting without writing. Add the missing keys to "
                  "scripts/phrase_translations_en_a11.py and re-run.")
            session.rollback()
            return 1

        if dry_run:
            session.rollback()
            print(f"[dry-run] would update {updated}, already set {skipped}.")
            return 0

        session.commit()

        remaining = session.exec(
            select(Phrase).where(
                Phrase.program_id == PROGRAM_ID,
                Phrase.translation_en == None,  # noqa: E711
            )
        ).all()

        print(f"Updated {updated} phrase(s); {skipped} already had a translation.")
        print(f"Remaining without translation_en: {len(remaining)}")
        return 0 if not remaining else 1


if __name__ == "__main__":
    sys.exit(main(dry_run="--dry-run" in sys.argv))
