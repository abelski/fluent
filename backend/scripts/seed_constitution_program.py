"""Seed script: builds the Lithuanian Constitution learning program for practice category 1.

Content source: backend/data/constitution/program_data.json  (all questions in Lithuanian)
Article texts:  fetched live from lrs.lt (for lesson_text_lt)

Usage (from repo root):
    python backend/scripts/seed_constitution_program.py --dry-run   # writes JSON to temp_files/
    python backend/scripts/seed_constitution_program.py              # inserts into DB
    python backend/scripts/seed_constitution_program.py --reset      # delete existing + reinsert
"""

import sys, os, re, json, argparse
from pathlib import Path
from typing import Optional

_here = Path(__file__).resolve().parent
_backend = _here.parent
sys.path.insert(0, str(_backend))

import httpx

CONSTITUTION_URL = "https://www.lrs.lt/home/Konstitucija/Konstitucija.htm"
CATEGORY_ID = 1
DATA_FILE = _backend / "data" / "constitution" / "program_data.json"

# --------------------------------------------------------------------------- #
# Scrape article texts from lrs.lt                                             #
# --------------------------------------------------------------------------- #

def fetch_articles() -> dict[int, str]:
    print("Fetching constitution from lrs.lt…")
    resp = httpx.get(CONSTITUTION_URL, timeout=30, follow_redirects=True)
    resp.raise_for_status()
    html = resp.content.decode("windows-1257", errors="replace")

    body_m = re.search(r"<body[^>]*>(.*?)</body>", html, re.DOTALL | re.IGNORECASE)
    body = body_m.group(1) if body_m else html

    body = re.sub(r"<br\s*/?>", "\n", body, flags=re.IGNORECASE)
    body = re.sub(r"</p>", "\n", body, flags=re.IGNORECASE)
    body = re.sub(r"<p[^>]*>", "\n", body, flags=re.IGNORECASE)
    body = re.sub(r"<b>|<strong>", "__B__", body, flags=re.IGNORECASE)
    body = re.sub(r"</b>|</strong>", "__/B__", body, flags=re.IGNORECASE)

    # Strip remaining tags
    body = re.sub(r"<[^>]+>", " ", body)
    body = re.sub(r"&nbsp;", " ", body)
    body = re.sub(r"&[a-z]+;", "", body)
    body = re.sub(r"\s+", " ", body).strip()

    articles: dict[int, str] = {}
    pattern = re.compile(r"(\d{1,3})\s+straipsnis", re.IGNORECASE)
    matches = list(pattern.finditer(body))
    for i, m in enumerate(matches):
        num = int(m.group(1))
        if num < 1 or num > 154:
            continue
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(body)
        text = body[start:end].strip()
        text = re.sub(r"__/?B__", "", text).strip()
        text = re.sub(r"^[\s\.,;:]+", "", text)
        articles[num] = text

    print(f"  Parsed {len(articles)} articles")
    return articles


def make_lesson_text(articles: dict[int, str], nums: list[int]) -> Optional[str]:
    if not nums:
        return None
    lines = []
    for n in nums:
        if n in articles:
            lines.append(f"**{n} straipsnis**\n{articles[n]}")
    return "\n\n".join(lines) if lines else None


# --------------------------------------------------------------------------- #
# Build program from data file                                                 #
# --------------------------------------------------------------------------- #

def build_program(articles: dict[int, str]) -> list[dict]:
    data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
    tests = []
    for entry in data:
        nums = entry.get("article_nums", [])
        lesson_text = make_lesson_text(articles, nums) if nums else None

        questions = []
        for q in entry["questions"]:
            questions.append({
                "question_ru": q["q"],
                "question_lt": q["q"],
                "option_a": q["a"],
                "option_b": q["b"],
                "option_c": q["c"],
                "option_d": q["d"],
                "correct_option": q["correct"],
            })

        tests.append({
            "sort_order": entry["sort_order"],
            "lesson_type": entry["lesson_type"],
            "title_ru": entry["title_ru"],
            "title_en": entry.get("title_en", ""),
            "description_ru": entry.get("description_ru", ""),
            "lesson_text_lt": lesson_text,
            "question_count": entry["question_count"],
            "pass_threshold": entry["pass_threshold"],
            "questions": questions,
        })
        print(f"  Prepared: {entry['title_ru'][:60]}")
    return tests


# --------------------------------------------------------------------------- #
# Insert into DB                                                               #
# --------------------------------------------------------------------------- #

def insert_into_db(tests: list[dict], reset: bool = False) -> None:
    from database import engine
    from models import PracticeTest, PracticeQuestion
    from sqlmodel import Session, select
    from datetime import datetime, timezone

    utcnow = lambda: datetime.now(timezone.utc)

    with Session(engine) as session:
        if reset:
            existing = session.exec(
                select(PracticeTest)
                .where(PracticeTest.category_id == CATEGORY_ID)
                .where(PracticeTest.sort_order > 0)
            ).all()
            print(f"  Deleting {len(existing)} existing tests…")
            for t in existing:
                for q in session.exec(select(PracticeQuestion).where(PracticeQuestion.test_id == t.id)).all():
                    session.delete(q)
                session.delete(t)
            session.commit()

        # Update diagnostic test (sort_order=0)
        diag = session.exec(
            select(PracticeTest)
            .where(PracticeTest.category_id == CATEGORY_ID)
            .where(PracticeTest.sort_order == 0)
        ).first()
        if diag:
            diag.pass_threshold = 0.0
            session.add(diag)
            print(f"  Updated diagnostic (id={diag.id}) → pass_threshold=0.0")

        for test_data in tests:
            existing = session.exec(
                select(PracticeTest)
                .where(PracticeTest.category_id == CATEGORY_ID)
                .where(PracticeTest.sort_order == test_data["sort_order"])
            ).first()
            if existing and not reset:
                print(f"  Skipping sort_order={test_data['sort_order']} (exists)")
                continue

            questions = test_data.pop("questions")
            test_data.pop("lesson_type", None)

            test = PracticeTest(
                category_id=CATEGORY_ID,
                status="published",
                created_at=utcnow(),
                **{k: v for k, v in test_data.items()},
            )
            session.add(test)
            session.flush()

            for i, q in enumerate(questions):
                session.add(PracticeQuestion(
                    test_id=test.id,
                    question_ru=q["question_ru"],
                    question_lt=q["question_lt"],
                    option_a=q["option_a"],
                    option_b=q["option_b"],
                    option_c=q["option_c"],
                    option_d=q["option_d"],
                    correct_option=q["correct_option"],
                    sort_order=i,
                    is_active=True,
                    created_at=utcnow(),
                ))

            print(f"  Inserted sort={test_data['sort_order']}: {test_data['title_ru'][:50]}")

        session.commit()
        print("Done.")


# --------------------------------------------------------------------------- #
# Main                                                                         #
# --------------------------------------------------------------------------- #

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--reset", action="store_true")
    parser.add_argument("--output", default="temp_files/constitution_program.json")
    args = parser.parse_args()

    articles = fetch_articles()
    print(f"Building program from {DATA_FILE.name}…")
    tests = build_program(articles)

    if args.dry_run:
        out = Path(args.output)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(
            json.dumps({"category_id": CATEGORY_ID, "total_tests": len(tests),
                        "total_questions": sum(len(t["questions"]) for t in tests),
                        "tests": tests},
                       ensure_ascii=False, indent=2),
            encoding="utf-8"
        )
        print(f"\nDry-run complete → {out}")
        print(f"  Tests: {len(tests)}, Questions: {sum(len(t['questions']) for t in tests)}")
    else:
        insert_into_db(tests, reset=args.reset)


if __name__ == "__main__":
    main()
