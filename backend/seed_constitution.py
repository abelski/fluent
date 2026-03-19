"""One-time seed script: load Lithuanian constitution questions into the DB.

Run from the backend directory:
    python seed_constitution.py

Safe to re-run — skips questions that already exist (matched by question_ru text).
"""

import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

from database import get_session, create_db_and_tables
from models import ConstitutionQuestion

DATA_FILE = Path(__file__).parent / "data" / "constitution" / "questions.json"


def main():
    create_db_and_tables()
    session = next(get_session())

    questions = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    added = 0
    skipped = 0

    for i, item in enumerate(questions):
        existing = session.exec(
            __import__("sqlmodel").select(ConstitutionQuestion).where(
                ConstitutionQuestion.question_ru == item["question_ru"]
            )
        ).first()
        if existing:
            skipped += 1
            continue

        q = ConstitutionQuestion(
            question_ru=item["question_ru"],
            option_a=item["option_a"],
            option_b=item["option_b"],
            option_c=item["option_c"],
            option_d=item["option_d"],
            correct_option=item["correct_option"],
            category=item.get("category"),
            is_active=True,
            sort_order=i,
        )
        session.add(q)
        added += 1

    session.commit()
    print(f"Done. Added: {added}, Skipped (already exist): {skipped}")


if __name__ == "__main__":
    main()
