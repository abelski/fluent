"""Title and description fixes for the #66 overview pages.

- Constitution tests: `title_ru` held the Lithuanian original. Move it to `title_lt` and put
  UI-language titles in `title_ru` / `title_en` («Тест 5: статьи 25–31» / "Test 5: Art. 25–31",
  «Контрольная 1: статьи 1–31» / "Checkpoint 1: Art. 1–31", «Пробный тест» / "Sample test").
- Reading tests: `title_en` held Lithuanian without diacritics («5 skyrius — Cia mano seima»).
  `title_en` gets real English, `title_lt` the Lithuanian with diacritics, `title_ru` loses the «».
- Reading category: description RU/EN (it had none) — only filled when empty.
- Verbs grammar program: description said «12 уроков» / "12 lessons"; it has 20.

Rows are found by natural keys (category name, the Lithuanian title or chapter number), never
ids. Idempotent: a row already in its target state is reported as `kept` and not touched, so a
second run is a no-op. One transaction.

Usage (from backend/):
    .venv/bin/python scripts/fix_practice_titles_66.py --dry-run   # default: report only
    .venv/bin/python scripts/fix_practice_titles_66.py --apply     # writes — the user's step on prod

Needs migration a9b0c1d2e3f4 (practice_test.title_lt) applied first.
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

_backend = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_backend))

from sqlmodel import Session, select  # noqa: E402

from models import GrammarProgram, PracticeCategory, PracticeTest  # noqa: E402

CONSTITUTION = "Конституция"
READING = "Чтение"

# Constitution tests that don't follow the «N pamoka» / «Kartojimas N» pattern, keyed by the
# Lithuanian original (old title_ru). The sample test has no Lithuanian original.
CONSTITUTION_SPECIAL = {
    "Пример теста Конституция Литвы": ("Пробный тест", "Sample test", None),
    "Tik skaičiai ir datos": ("Даты и числа", "Dates & Numbers Test", "Tik skaičiai ir datos"),
    "Baigiamasis egzaminas": ("Итоговый экзамен", "Final Exam", "Baigiamasis egzaminas"),
}
_SPECIAL_BY_NEW_RU = {v[0]: v for v in CONSTITUTION_SPECIAL.values()}  # finds already-fixed rows
_LESSON = re.compile(r"^(\d+) pamoka: .*\((\d+)–(\d+) str\.\)$")
_REVIEW = re.compile(r"^Kartojimas (\d+): .*\((\d+)–(\d+) str\.\)$")

# Reading tests keyed by textbook chapter: (title_ru, title_en, title_lt). The Lithuanian was
# restored from the textbook chapter titles; the user checks it.
READING_TITLES = {
    2: ("Это мой друг", "This is my friend", "2 skyrius — Čia mano draugas"),
    3: ("Какой твой адрес?", "What's your address?", "3 skyrius — Koks tavo adresas?"),
    4: ("Когда и где встречаемся?", "When and where do we meet?", "4 skyrius — Kada ir kur susitinkame?"),
    5: ("Это моя семья", "This is my family", "5 skyrius — Čia mano šeima"),
    6: ("Семья Линаса и Кристины", "Linas and Kristina's family", "6 skyrius — Lino ir Kristinos šeima"),
    7: ("Что мы едим", "What we eat", "7 skyrius — Ką mes valgome"),
    8: ("На рынке", "At the market", "8 skyrius — Turguje"),
    10: ("Сообщения", "Messages", "10 skyrius — Žinutės"),
    11: ("Аренда автомобиля", "Renting a car", "11 skyrius — Automobilių nuoma"),
    12: ("Аренда квартиры", "Renting a flat", "12 skyrius — Buto nuoma"),
    13: ("Дела дома", "Chores at home", "13 skyrius — Darbai namie"),
    14: ("Мои путешествия и шкаф", "My travels and my wardrobe", "14 skyrius — Mano kelionės ir spinta"),
    15: ("Объявления об услугах", "Service adverts", "15 skyrius — Paslaugų skelbimai"),
    16: ("Если простудились…", "If you've caught a cold…", "16 skyrius — Jeigu peršalote…"),
    17: ("Инструкция к лекарству", "Medicine leaflet", "17 skyrius — Vaistų informacinis lapelis"),
    18: ("Объявления о работе", "Job adverts", "18 skyrius — Darbo skelbimai"),
    19: ("Мой брат — студент", "My brother is a student", "19 skyrius — Mano brolis studentas"),
    20: ("Кино и досуг", "Cinema and free time", "20 skyrius — Kinas ir laisvalaikis"),
    21: ("Открытки и литовские праздники", "Postcards and Lithuanian holidays", "21 skyrius — Atvirukai ir lietuviškos šventės"),
}
_CHAPTER = re.compile(r"^(\d+) skyrius")

READING_DESCRIPTION = (
    "Короткие тексты из учебника: знакомство, семья, покупки, аренда, здоровье.",
    "Short textbook texts: introductions, family, shopping, renting, health.",
)
VERBS_DESCRIPTION_FIX = (("12 уроков", "20 уроков"), ("12 lessons", "20 lessons"))


def _constitution_target(t: PracticeTest) -> tuple[str, str, str | None] | None:
    """Target (ru, en, lt) for a Constitution test, or None if it matches no known pattern."""
    original = t.title_lt or t.title_ru
    for key in (original, t.title_ru):
        if key in CONSTITUTION_SPECIAL:
            return CONSTITUTION_SPECIAL[key]
        if key in _SPECIAL_BY_NEW_RU:
            return _SPECIAL_BY_NEW_RU[key]
    if (m := _LESSON.match(original)):
        n, a, b = m.groups()
        return f"Тест {n}: статьи {a}–{b}", f"Test {n}: Art. {a}–{b}", original
    if (m := _REVIEW.match(original)):
        n, a, b = m.groups()
        return f"Контрольная {n}: статьи {a}–{b}", f"Checkpoint {n}: Art. {a}–{b}", original
    return None


def _set(row, values: dict, counts: dict) -> None:
    changed = False
    for field, value in values.items():
        if getattr(row, field) != value:
            setattr(row, field, value)
            changed = True
    counts["changed" if changed else "kept"] += 1


def run(session: Session, apply: bool) -> dict[str, int]:
    counts = {"changed": 0, "kept": 0, "unmatched": 0}
    unmatched: list[str] = []
    cats = {c.name_ru: c for c in session.exec(select(PracticeCategory)).all()}

    if (cit := cats.get(CONSTITUTION)):
        for t in session.exec(select(PracticeTest).where(PracticeTest.category_id == cit.id)).all():
            target = _constitution_target(t)
            if target is None:
                unmatched.append(t.title_ru)
                continue
            ru, en, lt = target
            _set(t, {"title_ru": ru, "title_en": en, "title_lt": lt}, counts)
            session.add(t)

    if (reading := cats.get(READING)):
        for t in session.exec(select(PracticeTest).where(PracticeTest.category_id == reading.id)).all():
            m = _CHAPTER.match(t.title_lt or "") or _CHAPTER.match(t.title_en or "")
            target = READING_TITLES.get(int(m.group(1))) if m else None
            if target is None:
                unmatched.append(t.title_ru)
                continue
            ru, en, lt = target
            _set(t, {"title_ru": ru, "title_en": en, "title_lt": lt}, counts)
            session.add(t)
        values = {}
        if not reading.description_ru:
            values["description_ru"] = READING_DESCRIPTION[0]
        if not reading.description_en:
            values["description_en"] = READING_DESCRIPTION[1]
        if values:
            _set(reading, values, counts)
            session.add(reading)
        else:
            counts["kept"] += 1

    (old_ru, new_ru), (old_en, new_en) = VERBS_DESCRIPTION_FIX
    for p in session.exec(select(GrammarProgram).where(GrammarProgram.program_type == "verbs")).all():
        ru = (p.description or "").replace(old_ru, new_ru) or None
        en = (p.description_en or "").replace(old_en, new_en) or None
        _set(p, {"description": ru, "description_en": en}, counts)
        session.add(p)

    counts["unmatched"] = len(unmatched)
    if unmatched:
        print(f"  unmatched (left alone): {unmatched}")
    if apply:
        session.commit()
    else:
        session.rollback()
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="report only (default)")
    mode.add_argument("--apply", action="store_true", help="write to the DB")
    args = parser.parse_args()

    from database import engine  # the URL itself is never printed
    with Session(engine) as session:
        counts = run(session, apply=args.apply)
    print(("APPLIED" if args.apply else "DRY RUN (nothing written)") + ":")
    for k, n in counts.items():
        print(f"  {k:<10} {n}")


if __name__ == "__main__":
    main()
