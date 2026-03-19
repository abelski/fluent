"""Migration: move existing ConstitutionQuestion rows into the new PracticeTest system.

Creates a "Конституция Литвы" PracticeTest and copies all ConstitutionQuestion rows
into PracticeQuestion. Safe to re-run — skips if the test already exists.

Run from the backend directory:
    python migrate_to_practice_tests.py
"""

from dotenv import load_dotenv
load_dotenv()

from sqlmodel import select
from database import get_session, create_db_and_tables
from models import ConstitutionQuestion, PracticeTest, PracticeQuestion


def main():
    create_db_and_tables()
    session = next(get_session())

    # Check if already migrated
    existing = session.exec(
        select(PracticeTest).where(PracticeTest.title_ru == "Конституция Литвы")
    ).first()
    if existing:
        print(f"Already migrated — PracticeTest id={existing.id} exists. Skipping.")
        return

    # Create the test
    test = PracticeTest(
        title_ru="Конституция Литвы",
        title_en="Lithuanian Constitution",
        description_ru="Подготовка к экзамену на ПМЖ — вопросы о Конституции Литвы",
        description_en="Permanent residency exam preparation — Lithuanian Constitution questions",
        question_count=20,
        pass_threshold=0.75,
        is_active=True,
        sort_order=0,
    )
    session.add(test)
    session.flush()

    # Copy all constitution questions
    old_questions = session.exec(select(ConstitutionQuestion)).all()
    added = 0
    for q in old_questions:
        pq = PracticeQuestion(
            test_id=test.id,
            question_ru=q.question_ru,
            option_a=q.option_a,
            option_b=q.option_b,
            option_c=q.option_c,
            option_d=q.option_d,
            correct_option=q.correct_option,
            category=q.category,
            is_active=q.is_active,
            sort_order=q.sort_order,
        )
        session.add(pq)
        added += 1

    session.commit()
    print(f"Done. Created PracticeTest id={test.id}, migrated {added} questions.")


if __name__ == "__main__":
    main()
