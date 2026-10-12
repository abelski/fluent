"""Generic, insert-only seed for a practice category from a JSON file (#62b).

Usage:
    python scripts/seed_practice_category.py data/practice/tfns.json [--dry-run]

--dry-run validates the JSON and prints counts without touching any database.
If a category with the same name_ru exists, prints its id and changes nothing.
No --reset on purpose: deleting tests fails on Postgres once a practice_exam_result
references them (FK). Later fixes go through the admin editor.
Tests land as `testing` (admins only) — publish them in the admin panel.
"""

import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

TFNS_OPTIONS = ("Tiesa", "Netiesa", "Nepasakyta", "")


def validate_tfns(data: dict) -> None:
    """Raise ValueError if `data` breaks the True/False/Not stated rules (plan #62b Req 1–3, 6)."""
    cat = data.get("category") or {}
    if not cat.get("name_ru") or not cat.get("name_en"):
        raise ValueError("category needs name_ru and name_en")
    tests = data.get("tests") or []
    if len(tests) != 10:
        raise ValueError(f"expected 10 tests, got {len(tests)}")
    for i, t in enumerate(tests, 1):
        where = f"test {i} ({t.get('title_en')!r})"
        if not t.get("title_ru") or not t.get("title_en"):
            raise ValueError(f"{where}: title_ru and title_en required")
        n = len(t.get("lesson_text_lt") or "")
        if not 400 <= n <= 1200:
            raise ValueError(f"{where}: text length {n} not in 400–1200")
        qs = t.get("questions") or []
        if len(qs) != 6:
            raise ValueError(f"{where}: expected 6 statements, got {len(qs)}")
        seen = set()
        for q in qs:
            if set(q) - {"question_lt", "correct_option"}:
                raise ValueError(f"{where}: unexpected keys {sorted(set(q) - {'question_lt', 'correct_option'})}")
            text = (q.get("question_lt") or "").strip()
            if not text:
                raise ValueError(f"{where}: empty statement")
            if text in seen:
                raise ValueError(f"{where}: duplicate statement {text!r}")
            seen.add(text)
            if q.get("correct_option") not in ("a", "b", "c"):
                raise ValueError(f"{where}: correct_option must be a/b/c, got {q.get('correct_option')!r}")
        missing = {"a", "b", "c"} - {q["correct_option"] for q in qs}
        if missing:
            raise ValueError(f"{where}: no statement answered {sorted(missing)}")


_SPEAKER_LINE = re.compile(r"^\*\*[^*]+:\*\* .+")


def validate_dialogue(data: dict) -> None:
    """Raise ValueError if `data` breaks the Dialogues rules (plan #62c Req 4, 7)."""
    cat = data.get("category") or {}
    if not cat.get("name_ru") or not cat.get("name_en"):
        raise ValueError("category needs name_ru and name_en")
    tests = data.get("tests") or []
    if len(tests) != 10:
        raise ValueError(f"expected 10 tests, got {len(tests)}")
    for i, t in enumerate(tests, 1):
        where = f"test {i} ({t.get('title_en')!r})"
        if not t.get("title_ru") or not t.get("title_en"):
            raise ValueError(f"{where}: title_ru and title_en required")
        if t.get("kind") != "dialogue":
            raise ValueError(f"{where}: kind must be 'dialogue'")
        qs = t.get("questions") or []
        if not 5 <= len(qs) <= 6:
            raise ValueError(f"{where}: expected 5–6 turns, got {len(qs)}")
        for j, q in enumerate(qs, 1):
            turn = f"{where} turn {j}"
            if not _SPEAKER_LINE.match(q.get("question_lt") or ""):
                raise ValueError(f"{turn}: question_lt must look like '**Name:** text'")
            opts = q.get("options") or []
            if len(opts) != 4 or any(not str(o).strip() for o in opts):
                raise ValueError(f"{turn}: needs 4 non-empty options")
            if len({str(o).strip() for o in opts}) != 4:
                raise ValueError(f"{turn}: options must be distinct")
            if q.get("correct_option") not in ("a", "b", "c", "d"):
                raise ValueError(f"{turn}: correct_option must be a–d, got {q.get('correct_option')!r}")
            if not (q.get("source") or "").strip():
                raise ValueError(f"{turn}: source required")
        if len({q["correct_option"] for q in qs}) == 1:
            raise ValueError(f"{where}: every turn has the same correct letter")


def validate(data: dict) -> None:
    fmt = data.get("format")
    if fmt == "tfns":
        validate_tfns(data)
    elif fmt == "dialogue":
        validate_dialogue(data)
    else:
        raise ValueError(f"unknown format {fmt!r}")


def seed(session, data: dict):
    """Insert the category, tests and questions in one transaction. Returns (category_id, created)."""
    from sqlmodel import select
    from models import PracticeCategory, PracticeQuestion, PracticeTest

    c = data["category"]
    existing = session.exec(select(PracticeCategory).where(PracticeCategory.name_ru == c["name_ru"])).first()
    if existing:
        return existing.id, False

    cat = PracticeCategory(
        name_ru=c["name_ru"], name_en=c["name_en"],
        description_ru=c.get("description_ru"), description_en=c.get("description_en"),
        sort_order=c.get("sort_order", 0),
    )
    session.add(cat)
    session.flush()
    dialogue = data["format"] == "dialogue"
    for i, t in enumerate(data["tests"], 1):
        test = PracticeTest(
            category_id=cat.id, title_ru=t["title_ru"], title_en=t["title_en"],
            description_ru=t.get("description_ru"), description_en=t.get("description_en"),
            lesson_text_lt=None if dialogue else t["lesson_text_lt"],
            kind="dialogue" if dialogue else "choice",
            question_count=len(t["questions"]),
            pass_threshold=0.7, status="testing", is_premium=False, sort_order=i,
        )
        session.add(test)
        session.flush()
        for j, q in enumerate(t["questions"], 1):
            opts = q["options"] if dialogue else TFNS_OPTIONS  # dialogue `source` is not stored
            session.add(PracticeQuestion(
                test_id=test.id, question_lt=q["question_lt"], question_ru=q["question_lt"],
                option_a=opts[0], option_b=opts[1], option_c=opts[2], option_d=opts[3],
                correct_option=q["correct_option"], is_active=True, sort_order=j,
            ))
    session.commit()
    return cat.id, True


def main(argv: list[str]) -> int:
    args = [a for a in argv if a != "--dry-run"]
    if len(args) != 1:
        print(__doc__)
        return 2
    with open(args[0], encoding="utf-8") as f:
        data = json.load(f)
    try:
        validate(data)
    except ValueError as e:
        print(f"Invalid: {e}")
        return 1
    n_q = sum(len(t["questions"]) for t in data["tests"])
    print(f"Valid: 1 category, {len(data['tests'])} tests, {n_q} questions.")
    if "--dry-run" in argv:
        print("Dry run — database not touched.")
        return 0

    # Imported only here so --dry-run never loads the DB engine.
    from sqlmodel import Session
    from database import engine

    with Session(engine) as session:
        cat_id, created = seed(session, data)
    if created:
        print(f"Created category id={cat_id} (tests are `testing`; publish in the admin panel).")
    else:
        print(f"Category already exists (id={cat_id}). Nothing changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
