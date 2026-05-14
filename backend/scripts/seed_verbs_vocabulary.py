"""Seed script: create the '365 глаголов' vocabulary program.

Creates:
  - 1 SubcategoryMeta  (key='verbs_365', status='published')
  - 37 WordLists       (batches of 10 verbs each, last batch may be smaller)
  - 358+ Word rows     (one per extracted verb)
  - WordListItem join rows

Usage (from repo root):
    python backend/scripts/seed_verbs_vocabulary.py             # insert
    python backend/scripts/seed_verbs_vocabulary.py --reset     # delete & reinsert
    python backend/scripts/seed_verbs_vocabulary.py --dry-run   # count only
"""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from database import engine
from models import SubcategoryMeta, Word, WordList, WordListItem, Verb
from sqlmodel import Session, select

PROGRAM_KEY = "verbs_365"
BATCH_SIZE = 10


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    with Session(engine) as session:
        verbs = session.exec(select(Verb).order_by(Verb.number)).all()

    if not verbs:
        print("ERROR: No verbs in DB. Run seed_verbs_db.py first.", file=sys.stderr)
        sys.exit(1)

    print(f"Found {len(verbs)} verbs in DB")

    if args.dry_run:
        batches = (len(verbs) + BATCH_SIZE - 1) // BATCH_SIZE
        print(f"Would create 1 SubcategoryMeta, {batches} WordLists, {len(verbs)} Words")
        return

    with Session(engine) as session:
        if args.reset:
            # Remove existing program data
            meta = session.exec(
                select(SubcategoryMeta).where(SubcategoryMeta.key == PROGRAM_KEY)
            ).first()
            if meta:
                session.delete(meta)
            lists = session.exec(
                select(WordList).where(WordList.subcategory == PROGRAM_KEY)
            ).all()
            for wl in lists:
                items = session.exec(
                    select(WordListItem).where(WordListItem.word_list_id == wl.id)
                ).all()
                for item in items:
                    # Only delete the word if it belongs exclusively to this program
                    other = session.exec(
                        select(WordListItem)
                        .where(WordListItem.word_id == item.word_id)
                        .where(WordListItem.word_list_id != wl.id)
                    ).first()
                    if not other:
                        word = session.get(Word, item.word_id)
                        if word:
                            session.delete(word)
                    session.delete(item)
                session.delete(wl)
            session.commit()
            print(f"Reset: removed existing {PROGRAM_KEY} data")

        # 1. SubcategoryMeta
        existing_meta = session.exec(
            select(SubcategoryMeta).where(SubcategoryMeta.key == PROGRAM_KEY)
        ).first()
        if not existing_meta:
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
            print("Created SubcategoryMeta")

        # Reload verbs in ordered fashion
        verbs = session.exec(select(Verb).order_by(Verb.number)).all()

        # 2. Build batches and create WordLists + Words
        lists_created = words_created = 0

        for batch_start in range(0, len(verbs), BATCH_SIZE):
            batch = verbs[batch_start: batch_start + BATCH_SIZE]
            first_num = batch[0].number
            last_num = batch[-1].number
            title = f"Глаголы {first_num}–{last_num}"
            title_en = f"Verbs {first_num}–{last_num}"

            # Skip if already exists
            existing_list = session.exec(
                select(WordList).where(
                    WordList.subcategory == PROGRAM_KEY,
                    WordList.title == title,
                )
            ).first()
            if existing_list:
                continue

            word_list = WordList(
                title=title,
                title_en=title_en,
                subcategory=PROGRAM_KEY,
                is_public=True,
                cefr_level="A1-C1",
                difficulty="medium",
                sort_order=batch_start // BATCH_SIZE,
            )
            session.add(word_list)
            session.flush()  # get word_list.id

            for pos, verb in enumerate(batch):
                word = Word(
                    lithuanian=verb.infinitive,
                    translation_ru=verb.translation_ru,
                    translation_en="",
                    hint="глагол",
                    star=1,
                )
                session.add(word)
                session.flush()

                item = WordListItem(
                    word_list_id=word_list.id,
                    word_id=word.id,
                    position=pos,
                )
                session.add(item)
                words_created += 1

            lists_created += 1

        session.commit()

    print(f"Done: {lists_created} lists created, {words_created} words created")


if __name__ == "__main__":
    main()
