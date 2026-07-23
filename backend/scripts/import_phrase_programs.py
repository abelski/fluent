"""Import phrase programs from a JSON export into the database.

For bootstrapping a fresh database (a new dev environment, a restore). The JSON
is produced by `scripts.export_phrase_programs` from a live database — it is a
derived artifact, not a place to author content. To change phrase content, use
the admin panel; the database is the source of truth.

NON-DESTRUCTIVE by design. Programs are matched by title and phrases by text
within a program:
  - missing programs/phrases are inserted
  - existing ones are updated in place
  - nothing is ever deleted, so user progress rows keep their phrase_id

This replaces the old `seed_phrases.py`, whose main() deleted every
PhraseProgram along with all Phrase, UserPhraseProgress and
UserPhraseProgramEnrollment rows — wiping every user's progress on each run.

Run from the backend/ directory:
    .venv/bin/python -m scripts.import_phrase_programs [--in data/phrase_programs.json] [--dry-run]
"""

import argparse
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from sqlmodel import Session, select  # noqa: E402

from database import engine  # noqa: E402
from models import Phrase, PhraseProgram  # noqa: E402

DEFAULT_IN = Path(__file__).parent.parent / "data" / "phrase_programs.json"

_PHRASE_FIELDS = (
    "translation", "translation_en", "position",
    "chapter", "chapter_title", "chapter_title_en", "alt_texts",
)
_PROGRAM_FIELDS = (
    "title_en", "description", "description_en", "difficulty", "is_public",
)


def run(in_path: Path, dry_run: bool = False) -> int:
    if not in_path.exists():
        print(f"ERROR: {in_path} not found. Run scripts.export_phrase_programs first.")
        return 1

    data = json.loads(in_path.read_text(encoding="utf-8"))
    created_programs = updated_programs = 0
    created_phrases = updated_phrases = 0

    with Session(engine) as session:
        for entry in data:
            program = session.exec(
                select(PhraseProgram).where(PhraseProgram.title == entry["title"])
            ).first()

            if program is None:
                program = PhraseProgram(
                    title=entry["title"],
                    **{f: entry.get(f) for f in _PROGRAM_FIELDS},
                )
                session.add(program)
                session.flush()  # assign an id without committing
                created_programs += 1
            else:
                for f in _PROGRAM_FIELDS:
                    setattr(program, f, entry.get(f))
                session.add(program)
                updated_programs += 1

            existing = {
                p.text: p
                for p in session.exec(
                    select(Phrase).where(Phrase.program_id == program.id)
                ).all()
            }

            for row in entry["phrases"]:
                phrase = existing.get(row["text"])
                if phrase is None:
                    phrase = Phrase(
                        program_id=program.id,
                        text=row["text"],
                        **{f: row.get(f) for f in _PHRASE_FIELDS},
                    )
                    created_phrases += 1
                else:
                    for f in _PHRASE_FIELDS:
                        setattr(phrase, f, row.get(f))
                    updated_phrases += 1
                session.add(phrase)

        if dry_run:
            session.rollback()
            prefix = "[dry-run] would create"
        else:
            session.commit()
            prefix = "Created"

    print(f"{prefix} {created_programs} program(s), {created_phrases} phrase(s); "
          f"updated {updated_programs} program(s), {updated_phrases} phrase(s).")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--in", dest="in_path", type=Path, default=DEFAULT_IN)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    raise SystemExit(run(args.in_path, args.dry_run))
