"""Generic, insert-only seed for a practice category from a JSON file (#62b).

Usage:
    python scripts/seed_practice_category.py data/practice/tfns.json [--dry-run] [--update-text]

--dry-run validates the JSON and prints counts without touching any database.
If a category with the same name_ru exists, prints its id and changes nothing.
No --reset on purpose: deleting tests fails on Postgres once a practice_exam_result
references them (FK). Later fixes go through the admin editor.
Tests land as `testing` (admins only) — publish them in the admin panel.
--update-text (signs only, #62e): for an existing category, rewrite each question's text, options and
correct answer in place, matched by image_url; questions no longer in the file are deactivated and
each test's question_count is synced. Ids stay, so results referencing tests are safe.
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


_MARKER = re.compile(r"\{(\d+)\}")


def validate_gap_text(data: dict) -> None:
    """Raise ValueError if `data` breaks the Gap text rules (plan #62d Req 2, 6)."""
    cat = data.get("category") or {}
    if not cat.get("name_ru") or not cat.get("name_en"):
        raise ValueError("category needs name_ru and name_en")
    tests = data.get("tests") or []
    if len(tests) != 8:
        raise ValueError(f"expected 8 tests, got {len(tests)}")
    for i, t in enumerate(tests, 1):
        where = f"test {i} ({t.get('title_en')!r})"
        if not t.get("title_ru") or not t.get("title_en"):
            raise ValueError(f"{where}: title_ru and title_en required")
        if t.get("kind") != "gap_text":
            raise ValueError(f"{where}: kind must be 'gap_text'")
        text = t.get("lesson_text_lt") or ""
        if not 600 <= len(text) <= 1400:
            raise ValueError(f"{where}: text length {len(text)} not in 600–1400")
        qs = t.get("questions") or []
        if not 10 <= len(qs) <= 12:
            raise ValueError(f"{where}: expected 10–12 gaps, got {len(qs)}")
        markers = [int(m) for m in _MARKER.findall(text)]
        if markers != list(range(1, len(qs) + 1)):
            raise ValueError(f"{where}: markers must be {{1}}…{{{len(qs)}}} each once in order, got {markers}")
        rest = _MARKER.sub("", text)
        if "{" in rest or "}" in rest:
            raise ValueError(f"{where}: stray brace in text")
        answers = set()
        for n, q in enumerate(qs, 1):
            gap = f"{where} gap {n}"
            if q.get("question_lt") != f"{{{n}}}":
                raise ValueError(f"{gap}: question_lt must be '{{{n}}}'")
            a, b = (q.get("option_a") or "").strip(), (q.get("option_b") or "").strip()
            if not a or not b or a == b:
                raise ValueError(f"{gap}: option_a and option_b must be non-empty and different")
            if q.get("option_c") or q.get("option_d"):
                raise ValueError(f"{gap}: option_c/option_d must be empty")
            if q.get("correct_option") != "a":
                raise ValueError(f"{gap}: correct_option must be 'a'")
            answers.add(a)
        for n, q in enumerate(qs, 1):
            if q["option_b"].strip() in answers:
                raise ValueError(f"{where} gap {n}: distractor {q['option_b']!r} is another gap's answer")


from routers.practice import _IMAGE_URL_RE as _IMAGE_URL  # one rule, shared with the API
_PUBLIC = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "frontend", "public")
SIGNS_MAX_BYTES = 200 * 1024


def validate_signs(data: dict, public_dir: str = _PUBLIC) -> None:
    """Raise ValueError if `data` breaks the Signs and notices rules (plan #62e Req 6–9)."""
    cat = data.get("category") or {}
    if not cat.get("name_ru") or not cat.get("name_en"):
        raise ValueError("category needs name_ru and name_en")
    tests = data.get("tests") or []
    if len(tests) != 5:
        raise ValueError(f"expected 5 tests, got {len(tests)}")
    urls = [q.get("image_url") for t in tests for q in (t.get("questions") or [])]
    if len(urls) != len(set(urls)):  # --update-text matches questions by image_url
        raise ValueError("image_url must be unique across the category")
    for i, t in enumerate(tests, 1):
        where = f"test {i} ({t.get('title_en')!r})"
        if not t.get("title_ru") or not t.get("title_en"):
            raise ValueError(f"{where}: title_ru and title_en required")
        qs = t.get("questions") or []
        if not 5 <= len(qs) <= 6:  # the parking/road test has 5 (approved 2026-10-13)
            raise ValueError(f"{where}: expected 5–6 questions, got {len(qs)}")
        for j, q in enumerate(qs, 1):
            at = f"{where} question {j}"
            if not (q.get("question_lt") or "").strip():
                raise ValueError(f"{at}: question_lt required")
            url = q.get("image_url") or ""
            if not _IMAGE_URL.match(url) or ".." in url:
                raise ValueError(f"{at}: image_url {url!r} must be a site path like /img/signs/x.webp")
            path = os.path.join(public_dir, url.lstrip("/"))
            if not os.path.isfile(path):
                raise ValueError(f"{at}: image file {path} missing")
            if os.path.getsize(path) > SIGNS_MAX_BYTES:
                raise ValueError(f"{at}: image over 200 KB")
            if url.endswith(".webp"):
                with open(path, "rb") as f:
                    head = f.read(4096)
                if b"EXIF" in head or b"Exif" in head:
                    raise ValueError(f"{at}: image still carries EXIF metadata")
            if (q.get("licence") or "") != "CC0":
                if not (q.get("image_credit") or "").strip() or not (q.get("source_url") or "").strip():
                    raise ValueError(f"{at}: a non-CC0 photo needs image_credit and source_url")
            if (q.get("image_credit") or "").lower().startswith(("фото", "photo")):
                raise ValueError(f"{at}: image_credit is '<author>, <licence>' — the UI adds the Фото:/Photo: prefix")
            if len(q.get("image_credit") or "") > 200:
                raise ValueError(f"{at}: image_credit over 200 chars")
            opts = [str(o).strip() for o in (q.get("options") or [])]
            if not 3 <= len(opts) <= 4 or any(not o for o in opts):
                raise ValueError(f"{at}: needs 3–4 non-empty options")
            if len(set(opts)) != len(opts):
                raise ValueError(f"{at}: options must be distinct")
            if q.get("correct_option") not in tuple("abcd"[:len(opts)]):
                raise ValueError(f"{at}: correct_option must point at an option, got {q.get('correct_option')!r}")


def validate(data: dict) -> None:
    fmt = data.get("format")
    if fmt == "tfns":
        validate_tfns(data)
    elif fmt == "dialogue":
        validate_dialogue(data)
    elif fmt == "gap_text":
        validate_gap_text(data)
    elif fmt == "signs":
        validate_signs(data)
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
    fmt = data["format"]
    dialogue = fmt == "dialogue"
    for i, t in enumerate(data["tests"], 1):
        test = PracticeTest(
            category_id=cat.id, title_ru=t["title_ru"], title_en=t["title_en"],
            description_ru=t.get("description_ru"), description_en=t.get("description_en"),
            lesson_text_lt=None if fmt in ("dialogue", "signs") else t["lesson_text_lt"],
            kind=fmt if fmt in ("dialogue", "gap_text") else "choice",
            question_count=len(t["questions"]),
            pass_threshold=0.7, status="testing", is_premium=False, sort_order=i,
        )
        session.add(test)
        session.flush()
        for j, q in enumerate(t["questions"], 1):
            if fmt == "gap_text":
                opts = (q["option_a"], q["option_b"], "", "")
            elif fmt == "signs":
                opts = (list(q["options"]) + ["", "", ""])[:4]  # pad 3 options to 4
            else:
                opts = q["options"] if dialogue else TFNS_OPTIONS  # dialogue `source` is not stored
            session.add(PracticeQuestion(
                test_id=test.id, question_lt=q["question_lt"], question_ru=q["question_lt"],
                option_a=opts[0], option_b=opts[1], option_c=opts[2], option_d=opts[3],
                correct_option=q["correct_option"], is_active=True, sort_order=j,
                image_url=q.get("image_url"), image_credit=q.get("image_credit"),
            ))
    session.commit()
    return cat.id, True


def update_text(session, data: dict) -> int:
    """Rewrite text/options/answer of existing signs questions, matched by image_url. Returns count."""
    from sqlmodel import select
    from models import PracticeCategory, PracticeQuestion, PracticeTest

    cat = session.exec(select(PracticeCategory).where(PracticeCategory.name_ru == data["category"]["name_ru"])).first()
    if not cat:
        raise ValueError("category not found — run without --update-text first")
    rows = session.exec(
        select(PracticeQuestion).join(PracticeTest).where(PracticeTest.category_id == cat.id)
    ).all()
    by_url = {q.image_url: q for q in rows}
    wanted = [q for t in data["tests"] for q in t["questions"]]
    missing = [q["image_url"] for q in wanted if q["image_url"] not in by_url]
    if missing:
        raise ValueError(f"no stored question for {missing}")
    keep = {q["image_url"] for q in wanted}
    for row in rows:  # questions dropped from the file are hidden, never deleted (results may reference tests)
        if row.image_url not in keep and row.is_active:
            row.is_active = False
            session.add(row)
    for test in session.exec(select(PracticeTest).where(PracticeTest.category_id == cat.id)).all():
        test.question_count = sum(1 for r in rows if r.test_id == test.id and r.image_url in keep)
        session.add(test)
    for q in wanted:
        row = by_url[q["image_url"]]
        row.is_active = True
        opts = (list(q["options"]) + ["", "", ""])[:4]
        row.question_lt = row.question_ru = q["question_lt"]
        row.option_a, row.option_b, row.option_c, row.option_d = opts
        row.correct_option = q["correct_option"]
        session.add(row)
    session.commit()
    return len(wanted)


def main(argv: list[str]) -> int:
    args = [a for a in argv if a not in ("--dry-run", "--update-text")]
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

    if "--update-text" in argv:
        if data.get("format") != "signs":
            print("--update-text supports the signs format only.")
            return 2
        with Session(engine) as session:
            n = update_text(session, data)
        print(f"Updated {n} questions in place.")
        return 0

    with Session(engine) as session:
        cat_id, created = seed(session, data)
    if created:
        print(f"Created category id={cat_id} (tests are `testing`; publish in the admin panel).")
    else:
        print(f"Category already exists (id={cat_id}). Nothing changed.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
