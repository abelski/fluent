"""
Seed the database with Lithuanian vocabulary organized by topic.

Run from the project root:
    cd api && python ../scripts/seed.py

Or via render.yaml build command (already configured).
"""
import sys
import os

# Add api/ to Python path so imports resolve correctly when run from scripts/.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "api"))

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), "..", "api", ".env"))

from sqlmodel import Session, select
from core.database import engine, create_db_and_tables
from models import Word, WordList, WordListItem
from data.vocabulary import WORD_LISTS

create_db_and_tables()


def seed():
    with Session(engine) as session:
        from models import UserWordProgress
        for row in session.exec(select(UserWordProgress)).all():
            session.delete(row)

        for row in session.exec(select(WordListItem)).all():
            session.delete(row)

        for row in session.exec(select(Word)).all():
            session.delete(row)

        for row in session.exec(select(WordList)).all():
            session.delete(row)

        session.commit()
        print("Cleared existing word lists, words and items.")

        for list_data in WORD_LISTS:
            wl = WordList(
                title=list_data["title"],
                description=list_data["description"],
            )
            session.add(wl)
            session.flush()

            for position, (lt, en, ru, hint) in enumerate(list_data["words"]):
                word = Word(
                    lithuanian=lt,
                    translation_en=en,
                    translation_ru=ru,
                    hint=hint,
                )
                session.add(word)
                session.flush()

                item = WordListItem(
                    word_list_id=wl.id,
                    word_id=word.id,
                    position=position,
                )
                session.add(item)

        session.commit()
        print(f"Seeded {len(WORD_LISTS)} word lists.")
        for ld in WORD_LISTS:
            print(f"  - {ld['title']}: {len(ld['words'])} words")


if __name__ == "__main__":
    seed()
