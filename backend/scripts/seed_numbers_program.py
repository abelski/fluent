"""Seed script: builds the Lithuanian Numbers grammar program.

Content source: backend/data/numbers/program_data.json

Usage (from repo root):
    python backend/scripts/seed_numbers_program.py --dry-run   # writes JSON to temp_files/
    python backend/scripts/seed_numbers_program.py              # inserts into DB
    python backend/scripts/seed_numbers_program.py --reset      # delete existing + reinsert
"""

import sys, json, argparse
from pathlib import Path
from datetime import datetime, timezone

_here = Path(__file__).resolve().parent
_backend = _here.parent
sys.path.insert(0, str(_backend))

DATA_FILE = _backend / "data" / "numbers" / "program_data.json"

CATEGORY_NAME_RU = "Skaičiai — числа (A1)"
CATEGORY_NAME_EN = "Numbers (A1)"
CATEGORY_DESCRIPTION = "Числительные литовского языка: кардинальные, порядковые, собирательные, падежи с числами."
CATEGORY_SORT_ORDER = 3


def _utcnow():
    return datetime.now(timezone.utc)


def build_tests() -> list[dict]:
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    tests = []
    for entry in data:
        questions = [
            {
                "question_ru": q["q"],
                "question_lt": q["q"],
                "option_a": q["a"],
                "option_b": q["b"],
                "option_c": q["c"],
                "option_d": q["d"],
                "correct_option": q["correct"],
            }
            for q in entry["questions"]
        ]
        tests.append({
            "sort_order": entry["sort_order"],
            "title_ru": entry["title_ru"],
            "title_en": entry.get("title_en", ""),
            "description_ru": entry.get("description_ru", ""),
            "lesson_text_lt": entry.get("lesson_text_lt"),
            "question_count": entry["question_count"],
            "pass_threshold": entry["pass_threshold"],
            "questions": questions,
        })
        print(f"  Prepared: {entry['title_ru'][:60]}")
    return tests


def insert_into_db(tests: list[dict], reset: bool = False) -> None:
    from database import engine
    from models import PracticeCategory, PracticeTest, PracticeQuestion
    from sqlmodel import Session, select

    with Session(engine) as session:
        # Find or create category
        category = session.exec(
            select(PracticeCategory).where(PracticeCategory.name_ru == CATEGORY_NAME_RU)
        ).first()

        if not category:
            category = PracticeCategory(
                name_ru=CATEGORY_NAME_RU,
                name_en=CATEGORY_NAME_EN,
                description_ru=CATEGORY_DESCRIPTION,
                sort_order=CATEGORY_SORT_ORDER,
                created_at=_utcnow(),
            )
            session.add(category)
            session.flush()
            print(f"  Created category: {CATEGORY_NAME_RU} (id={category.id})")
        else:
            print(f"  Found existing category: {CATEGORY_NAME_RU} (id={category.id})")

        category_id = category.id

        if reset:
            existing = session.exec(
                select(PracticeTest).where(PracticeTest.category_id == category_id)
            ).all()
            print(f"  Deleting {len(existing)} existing tests…")
            for t in existing:
                for q in session.exec(
                    select(PracticeQuestion).where(PracticeQuestion.test_id == t.id)
                ).all():
                    session.delete(q)
                session.delete(t)
            session.commit()

        for test_data in tests:
            questions = test_data.pop("questions")

            existing = session.exec(
                select(PracticeTest)
                .where(PracticeTest.category_id == category_id)
                .where(PracticeTest.sort_order == test_data["sort_order"])
            ).first()

            if existing and not reset:
                print(f"  Skipping sort_order={test_data['sort_order']} (exists)")
                continue

            test = PracticeTest(
                category_id=category_id,
                status="published",
                created_at=_utcnow(),
                **test_data,
            )
            session.add(test)
            session.flush()

            for i, q in enumerate(questions):
                session.add(PracticeQuestion(
                    test_id=test.id,
                    question_ru=q["question_ru"],
                    question_lt=q["question_lt"],
                    option_a=q["option_a"],
                    option_b=q["option_b"],
                    option_c=q["option_c"],
                    option_d=q["option_d"],
                    correct_option=q["correct_option"],
                    sort_order=i,
                    is_active=True,
                    created_at=_utcnow(),
                ))

            print(f"  Inserted sort={test_data['sort_order']}: {test_data['title_ru'][:50]}")

        session.commit()
        print("Done.")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--output", default="temp_files/numbers_program.json")
    args = parser.parse_args()

    print(f"Building numbers program from {DATA_FILE.name}…")
    tests = build_tests()

    if args.dry_run:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps({
                "category": CATEGORY_NAME_RU,
                "total_tests": len(tests),
                "total_questions": sum(len(t["questions"]) for t in tests),
                "tests": tests,
            }, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"\nDry-run complete → {out}")
        print(f"  Tests: {len(tests)}, Questions: {sum(len(t['questions']) for t in tests)}")
    else:
        insert_into_db(tests, reset=args.reset)


if __name__ == "__main__":
    main()
