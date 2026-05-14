"""Seed the verb grammar programs into GrammarProgram table.

Creates two programs:
  - 'Спряжение глаголов'  (program_type='verbs',      difficulty=2)
  - 'Управление глаголов' (program_type='verb_cases',  difficulty=2)

Usage (from repo root):
    python backend/scripts/seed_verbs_grammar.py
    python backend/scripts/seed_verbs_grammar.py --reset
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import engine
from models import GrammarProgram
from sqlmodel import Session, select

PROGRAMS = [
    {
        "title": "Спряжение глаголов",
        "title_en": "Verb Conjugation",
        "description": (
            "Упражнения на спряжение литовских глаголов: настоящее, прошедшее, "
            "будущее время, условное и повелительное наклонение. 12 уроков."
        ),
        "difficulty": 2,
        "program_type": "verbs",
    },
    {
        "title": "Управление глаголов",
        "title_en": "Verb Case Governance",
        "description": (
            "Отработайте падежи, которыми управляют 365 литовских глаголов. "
            "Примеры из книги «365 глаголов литовского языка»."
        ),
        "difficulty": 2,
        "program_type": "verb_cases",
    },
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true", help="Delete existing verb programs and reinsert")
    args = parser.parse_args()

    with Session(engine) as session:
        if args.reset:
            verb_types = {"verbs", "verb_cases"}
            existing = session.exec(select(GrammarProgram)).all()
            for p in existing:
                if p.program_type in verb_types:
                    session.delete(p)
            session.commit()
            print("Deleted existing verb grammar programs.")

        existing_titles = {
            p.title for p in session.exec(select(GrammarProgram)).all()
        }

        created = 0
        for prog_data in PROGRAMS:
            if prog_data["title"] in existing_titles:
                print(f"  Already exists: {prog_data['title']}")
                continue
            program = GrammarProgram(**prog_data)
            session.add(program)
            session.flush()
            print(f"  Created: {prog_data['title']} (id={program.id}, type={prog_data['program_type']})")
            created += 1

        session.commit()

    print(f"Done: {created} programs seeded")


if __name__ == "__main__":
    main()
