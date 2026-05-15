"""Tag verbs with the vocabulary programs they belong to.

Matches verb infinitives (which carry Lithuanian stress marks) to plain
vocabulary words by stripping stress diacritics via NFD normalization.

Usage (from repo root):
    python backend/scripts/seed_verb_programs.py
"""
import json
import sys
import unicodedata
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv
load_dotenv()

from sqlmodel import Session, select
from database import engine
from models import Verb, Word, WordList

# Combining codepoints used as stress / tone marks in Lithuanian textbooks
# (acute, grave, tilde-as-tone). Keep macron (ū), ogonek (ą ę ų į), dot (ė), caron (š č ž).
_STRESS_MARKS = frozenset(['́', '̀', '̃'])


def strip_stress(text: str) -> str:
    """Return text with Lithuanian stress diacritics removed."""
    nfd = unicodedata.normalize('NFD', text)
    cleaned = ''.join(c for c in nfd if c not in _STRESS_MARKS)
    return unicodedata.normalize('NFC', cleaned).lower()


# Map: vocab_program_key → subcategory key in word_list table
PROGRAM_TO_SUBCATEGORY = {
    "sekmes": "sekmes",
}


def main():
    with Session(engine) as session:
        verbs = session.exec(select(Verb)).all()
        verb_map: dict[str, list[Verb]] = {}
        for v in verbs:
            plain = strip_stress(v.infinitive)
            verb_map.setdefault(plain, []).append(v)

        updated = 0
        for prog_key, subcat in PROGRAM_TO_SUBCATEGORY.items():
            # Collect all plain Lithuanian words in this vocabulary program
            words = session.exec(
                select(Word.lithuanian)
                .join(WordList, Word.id == WordList.id, isouter=False)
            ).all()

            # Simpler: get all words from lists in this subcategory
            from sqlmodel import select as _select
            from models import WordListItem
            rows = session.exec(
                _select(Word.lithuanian)
                .join(WordListItem, Word.id == WordListItem.word_id)
                .join(WordList, WordListItem.word_list_id == WordList.id)
                .where(WordList.subcategory == subcat)
            ).all()

            vocab_words: set[str] = {w.lower().strip() for w in rows if w}

            matched = 0
            for plain, verb_list in verb_map.items():
                if plain in vocab_words:
                    for verb in verb_list:
                        existing: list = json.loads(verb.programs)
                        if prog_key not in existing:
                            existing.append(prog_key)
                            verb.programs = json.dumps(existing, ensure_ascii=False)
                            session.add(verb)
                            matched += 1

            print(f"  {prog_key}: tagged {matched} verbs")
            updated += matched

        session.commit()
        print(f"Done — {updated} verb rows updated.")

        # Report final state
        tagged = [v for v in session.exec(select(Verb)).all() if json.loads(v.programs)]
        print(f"\nTagged verbs total: {len(tagged)}")
        for v in sorted(tagged, key=lambda x: x.infinitive):
            print(f"  {v.infinitive} ({strip_stress(v.infinitive)}) → {json.loads(v.programs)}")


if __name__ == "__main__":
    main()
