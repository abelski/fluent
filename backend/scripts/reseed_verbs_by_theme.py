"""Re-create verbs_365 WordLists grouped by theme, ordered by freq_rank.

Replaces the old alphabetical "Глаголы 1–10" batches with thematic lists
(Основные глаголы, Общение, Движение, etc.) sorted by usage frequency.

Existing Word rows are REUSED by matching on the `lithuanian` field so
UserWordProgress rows are preserved.

Usage (from repo root):
    python backend/scripts/reseed_verbs_by_theme.py --dry-run
    python backend/scripts/reseed_verbs_by_theme.py
"""

import argparse
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


_STRESS_MARKS = {'̀', '́', '̂', '̃'}
_PRECOMPOSED_STRESS = str.maketrans({
    'á': 'a', 'à': 'a', 'â': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i',
    'ó': 'o', 'ò': 'o', 'ô': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u',
    'ý': 'y', 'ỹ': 'y',
})


def strip_stress(text: str) -> str:
    """Remove stress notation from Lithuanian infinitives (both combining marks and precomposed)."""
    import re
    nfd = unicodedata.normalize('NFD', text)
    cleaned = ''.join(c for c in nfd if c not in _STRESS_MARKS)
    nfc = unicodedata.normalize('NFC', cleaned)
    nfc = nfc.replace('i̇', 'i')  # remove artifact dotted-i from source data
    nfc = nfc.translate(_PRECOMPOSED_STRESS)
    return re.sub(r'\s+', '', nfc).strip()

from database import engine
from models import SubcategoryMeta, Verb, Word, WordList, WordListItem
from sqlmodel import Session, select

PROGRAM_KEY = "verbs_365"

THEME_ORDER = [
    ("essential",     "Основные глаголы",         "Essential Verbs"),
    ("communication", "Общение",                   "Communication"),
    ("motion",        "Движение",                  "Motion"),
    ("daily_life",    "Повседневная жизнь",        "Daily Life"),
    ("emotion",       "Чувства",                   "Emotions"),
    ("cognition",     "Мышление и восприятие",     "Thinking & Perception"),
    ("social",        "Социальное взаимодействие", "Social Interaction"),
    ("home",          "Дом и быт",                 "Home & Daily Chores"),
    ("work_study",    "Работа и учёба",            "Work & Study"),
    ("other",         "Разное",                    "Other"),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with Session(engine) as session:
        verbs = session.exec(
            select(Verb)
            .where(Verb.freq_rank != None)
            .where(Verb.theme != None)
            .order_by(Verb.freq_rank)
        ).all()

    if not verbs:
        print("ERROR: No verbs with freq_rank/theme. Run seed_verb_themes.py first.", file=sys.stderr)
        sys.exit(1)

    # Group by theme
    by_theme: dict[str, list[Verb]] = {}
    for verb in verbs:
        by_theme.setdefault(verb.theme, []).append(verb)

    print(f"Found {len(verbs)} themed verbs across {len(by_theme)} themes:")
    for key, name_ru, _ in THEME_ORDER:
        count = len(by_theme.get(key, []))
        print(f"  {key}: {count} verbs")

    if args.dry_run:
        print("Dry run — no changes made.")
        return

    with Session(engine) as session:
        # Remove old alphabetical WordLists for verbs_365
        old_lists = session.exec(
            select(WordList).where(WordList.subcategory == PROGRAM_KEY)
        ).all()
        removed_lists = removed_items = 0
        old_alpha_lists = [wl for wl in old_lists if wl.title.startswith("Глаголы")]

        # Delete items first (clears FK references to word_list), then lists
        # Words are kept — they may have user_word_progress rows
        for wl in old_alpha_lists:
            items = session.exec(
                select(WordListItem).where(WordListItem.word_list_id == wl.id)
            ).all()
            for item in items:
                session.delete(item)
                removed_items += 1
        session.flush()
        for wl in old_alpha_lists:
            session.delete(wl)
            removed_lists += 1
        session.commit()
        if removed_lists:
            print(f"Removed {removed_lists} old lists, {removed_items} items (words preserved)")

        # Ensure SubcategoryMeta exists
        meta = session.exec(
            select(SubcategoryMeta).where(SubcategoryMeta.key == PROGRAM_KEY)
        ).first()
        if not meta:
            meta = SubcategoryMeta(
                key=PROGRAM_KEY,
                name_ru="365 глаголов",
                name_en="365 Verbs",
                cefr_level="A1-C1",
                difficulty="medium",
                status="published",
                sort_order=10,
            )
            session.add(meta)
            session.commit()

        # Build thematic WordLists
        lists_created = words_created = words_reused = 0

        for sort_idx, (theme_key, name_ru, name_en) in enumerate(THEME_ORDER):
            theme_verbs = by_theme.get(theme_key, [])
            if not theme_verbs:
                continue

            # Skip if this thematic list already exists
            existing = session.exec(
                select(WordList).where(
                    WordList.subcategory == PROGRAM_KEY,
                    WordList.title == name_ru,
                )
            ).first()
            if existing:
                print(f"  Skipping '{name_ru}' (already exists)")
                continue

            word_list = WordList(
                title=name_ru,
                title_en=name_en,
                subcategory=PROGRAM_KEY,
                is_public=True,
                cefr_level="A1-C1",
                difficulty="medium",
                sort_order=sort_idx,
            )
            session.add(word_list)
            session.flush()

            for pos, verb in enumerate(theme_verbs):
                clean_infinitive = strip_stress(verb.infinitive)
                # Reuse existing Word row if one already exists for this infinitive
                existing_word = session.exec(
                    select(Word).where(Word.lithuanian == clean_infinitive)
                ).first()
                if existing_word:
                    word = existing_word
                    words_reused += 1
                else:
                    word = Word(
                        lithuanian=clean_infinitive,
                        translation_ru=verb.translation_ru,
                        translation_en="",
                        hint="глагол",
                        star=1,
                    )
                    session.add(word)
                    session.flush()
                    words_created += 1

                item = WordListItem(
                    word_list_id=word_list.id,
                    word_id=word.id,
                    position=pos,
                )
                session.add(item)

            lists_created += 1

        session.commit()

    print(
        f"Done: {lists_created} thematic lists created, "
        f"{words_created} new words, {words_reused} reused."
    )


if __name__ == "__main__":
    main()
