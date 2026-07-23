"""Export phrase programs from the database to JSON.

The database is the source of truth for phrase content — it is what the app
serves and what the admin panel edits. This script produces a *derived* backup
artifact; nothing here is hand-maintained.

That is the inverse of the old `seed_phrases.py`, which held ~180 phrases as
Python literals and pushed them into the DB. Content edited through the admin
panel never made it back into that file, so the two drifted apart silently.

Run from the backend/ directory:
    .venv/bin/python -m scripts.export_phrase_programs [--out data/phrase_programs.json]

Pair with `scripts.import_phrase_programs` to bootstrap a fresh database.
"""

import argparse
import json
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

from sqlmodel import Session, select  # noqa: E402

from database import engine  # noqa: E402
from models import Phrase, PhraseProgram  # noqa: E402

DEFAULT_OUT = Path(__file__).parent.parent / "data" / "phrase_programs.json"


def export(out_path: Path) -> int:
    with Session(engine) as session:
        programs = session.exec(select(PhraseProgram).order_by(PhraseProgram.id)).all()

        payload = []
        total_phrases = 0
        for program in programs:
            phrases = session.exec(
                select(Phrase)
                .where(Phrase.program_id == program.id)
                .order_by(Phrase.position)
            ).all()
            total_phrases += len(phrases)
            payload.append({
                "title": program.title,
                "title_en": program.title_en,
                "description": program.description,
                "description_en": program.description_en,
                "difficulty": program.difficulty,
                "is_public": program.is_public,
                "phrases": [
                    {
                        "text": p.text,
                        "translation": p.translation,
                        "translation_en": p.translation_en,
                        "position": p.position,
                        "chapter": p.chapter,
                        "chapter_title": p.chapter_title,
                        "chapter_title_en": p.chapter_title_en,
                        "alt_texts": p.alt_texts,
                    }
                    for p in phrases
                ],
            })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Exported {len(payload)} program(s), {total_phrases} phrase(s) → {out_path}")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    raise SystemExit(export(parser.parse_args().out))
