"""Migration 002: Add title_en / description_en columns to word_list and seed English translations.

Run once against the target database:
    cd backend && python migrations/002_word_list_title_en.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from database import engine  # noqa: E402
from sqlalchemy import text  # noqa: E402

TRANSLATIONS = [
    (154, "Shopping and Services",      "Shopping and services"),
    (155, "Car and Driving",            "Car and driving"),
    (156, "Adjectives",                 "Adjectives and descriptions"),
    (157, "Clothes and Accessories",    "Clothes and accessories"),
    (158, "Emotions and States",        "Emotions and states"),
    (159, "Cooking",                    "Verbs and cooking methods"),
    (160, "Drinks",                     "Drinks"),
    (161, "Grammar Words",              "Function words and adverbs"),
    (162, "Miscellaneous",              "General and miscellaneous"),
    (163, "Body and Health",            "Body and health"),
    (164, "Time and Seasons",           "Time, calendar and seasons"),
    (165, "Leisure and Sports",         "Leisure, culture and sports"),
    (166, "Diseases and Symptoms",      "Diseases and symptoms"),
    (167, "Food and Ingredients",       "Food and ingredients"),
    (168, "Medicine",                   "Medicine and healthcare"),
    (169, "City and Places",            "City and places"),
    (170, "Home and Daily Life",        "Home and daily life"),
    (171, "Dishes and Meals",           "Dishes and meals"),
    (172, "Professions and Work",       "Professions and work"),
    (173, "Family and People",          "Family and people"),
    (174, "Colours",                    "Colours"),
    (175, "Holidays and Celebrations",  "Holidays and celebrations"),
    (176, "Education",                  "Education"),
    (177, "Transport and Travel",       "Transport and travel"),
    (178, "Verbs",                      "Common verbs"),
    (179, "Most Common Words",          "Frequent words from the constitution"),
    (180, "Economics and Finance",      "Economics and finance"),
    (181, "Defence and Security",       "Defence and security"),
    (182, "Elections and Democracy",    "Elections and democracy"),
    (183, "Law and Constitution",       "Law and constitution"),
    (184, "Rights and Freedoms",        "Rights and freedoms"),
    (185, "State Institutions",         "State institutions"),
    (186, "Society and Culture",        "Society and culture"),
]


def run() -> None:
    with engine.connect() as conn:
        # Add columns (idempotent)
        conn.execute(text("ALTER TABLE word_list ADD COLUMN IF NOT EXISTS title_en VARCHAR"))
        conn.execute(text("ALTER TABLE word_list ADD COLUMN IF NOT EXISTS description_en VARCHAR"))

        # Seed English translations for known lists
        for list_id, title_en, description_en in TRANSLATIONS:
            conn.execute(
                text(
                    "UPDATE word_list SET title_en = :t, description_en = :d "
                    "WHERE id = :id AND title_en IS NULL"
                ),
                {"t": title_en, "d": description_en, "id": list_id},
            )
        conn.commit()

    print(f"Migration 002 complete — seeded {len(TRANSLATIONS)} lists.")


if __name__ == "__main__":
    run()
