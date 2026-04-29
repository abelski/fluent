"""Seed script: creates the Skaitymas reading practice program.

Run from the backend/ directory:
    python scripts/seed_skaitymas.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import engine
from models import PracticeCategory, PracticeTest, PracticeQuestion
from sqlmodel import Session, select

LESSONS = [
    {
        "title_ru": "\u0423\u0440\u043e\u043a 2 \u2014 \xabMano draugas\xbb",
        "title_en": "2 skyrius - Cia mano draugas (p. 41)",
        "sort_order": 1,
        "lesson_text_lt": (
            "*Lina ir Tomas apie Maiklą:*\n\n"
            "\u2014 Tomai, ar Maiklas yra tavo draugas?\n"
            "\u2014 Taip, Lina, Maiklas yra mano draugas.\n"
            "\u2014 Ar jis kalba lietuviškai?\n"
            "\u2014 Ne, Maiklas nekalba lietuviškai.\n"
            "\u2014 Kaip jūs, tu ir Maiklas, kalbate? Angliškai?\n"
            "\u2014 Taip. O tu, Lina, kalbi angliškai?\n"
            "\u2014 Taip, aš kalbu angliškai ir ispaniškai. Ar Maiklas supranta ispaniškai?\n"
            "\u2014 Taip, jis labai gerai kalba ispaniškai.\n"
            "\u2014 O tu, Tomai?\n"
            "\u2014 Aš nekalbu ispaniškai.\n"
        ),
        "questions": [
            ("Tomas kalba ispaniškai.", "b"),
            ("Maiklas kalba lietuviškai.", "b"),
            ("Lina kalba angliškai.", "a"),
            ("Maiklas gerai kalba ispaniškai.", "a"),
            ("Tomas kalba angliškai.", "a"),
            ("Lina kalba ispaniškai.", "a"),
        ],
    },
]


def main():
    with Session(engine) as session:
        existing = session.exec(
            select(PracticeCategory).where(PracticeCategory.name_en == "Skaitymas")
        ).first()
        if existing:
            print(f"Category 'Skaitymas' already exists (id={existing.id}). Skipping.")
            return
        print("Would create category...")


if __name__ == "__main__":
    main()
