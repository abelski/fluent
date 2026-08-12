"""
Integrity checks for verb conjugation data (issue #151).

The book's stress marks are zero-width glyphs, so any whitespace-based reading
of the PDF mis-segments rows and shifts tense columns. These checks pin the
defect classes that produced, so a regression cannot ship silently.

Usage:
    python backend/scripts/validate_verbs.py                  # check the DB
    python backend/scripts/validate_verbs.py --source json    # check the extract
    python backend/scripts/validate_verbs.py --soft           # also list review items

Exits non-zero if any HARD check fails.
"""

import argparse
import json
import sys
import unicodedata
from collections import Counter
from pathlib import Path

JSON_PATH = Path("temp_files/verbs_extracted.json")

TENSES = (
    "indicative_present",
    "indicative_past_simple",
    "indicative_past_habitual",
    "indicative_future",
    "conditional",
    "imperative",
)
PERSONS = ("aš", "tu", "jis, ji, jie, jos", "mes", "jūs")
TONE_MARKS = frozenset("̀́̃")

# Tenses that are fully regular off the infinitive stem — used by the soft
# ending check. Reflexive variants get "si"/"s" appended.
REGULAR_ENDINGS = {
    "conditional": ("čiau", "tum", "tų", "tume", "tumėme", "tute", "tumėte"),
    "indicative_future": ("siu", "si", "s", "sime", "site"),
    "indicative_past_habitual": ("davau", "davai", "davo", "davome", "davote"),
}


def base_letters(text: str) -> str:
    return "".join(
        c for c in unicodedata.normalize("NFD", text)
        if not unicodedata.combining(c) and not c.isspace()
    )


def stem_of(infinitive: str) -> str:
    b = base_letters(infinitive).lower()
    for suffix in ("tis", "ti"):
        if b.endswith(suffix):
            return b[: -len(suffix)]
    return b


def load_json() -> list[dict]:
    verbs = json.loads(JSON_PATH.read_text(encoding="utf-8"))
    return [v for v in verbs if v.get("infinitive")]


def load_db() -> list[dict]:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from sqlmodel import Session, select  # noqa: E402
    from database import engine  # noqa: E402
    from models import Verb  # noqa: E402

    out = []
    with Session(engine) as session:
        for v in session.exec(select(Verb)).all():
            out.append({
                "number": v.number,
                "infinitive": v.infinitive,
                "present_3p": v.present_3p,
                "past_3p": v.past_3p,
                "conjugations": json.loads(v.conjugations or "{}"),
            })
    return out


# ── Hard checks ───────────────────────────────────────────────────────────────

def check_hard(verbs: list[dict]) -> list[str]:
    failures: list[str] = []
    for v in verbs:
        num, inf = v.get("number"), v.get("infinitive", "")
        conj = v.get("conjugations") or {}

        # 2. No stray whitespace in the principal parts. " / " joins the
        #    alternates the book prints for a few verbs (bū́ti: "yrà / būña").
        for field in ("infinitive", "present_3p", "past_3p"):
            val = (v.get(field) or "").replace(" / ", "")
            if " " in val.strip():
                failures.append(f"#{num} {inf}: {field} contains a space: {val!r}")

        # 4. Shape. Impersonal verbs (lýti "it rains", reikė́ti "to be needed")
        #    are third-person only by nature, so require the full person set
        #    only where a first- or second-person form exists at all.
        impersonal = all(
            not (conj.get(t) or {}).get(p)
            for t in TENSES for p in PERSONS if p != "jis, ji, jie, jos"
        )
        missing = [t for t in TENSES if t not in conj]
        if missing:
            failures.append(f"#{num} {inf}: missing tenses {missing}")
        for tense in TENSES:
            persons = conj.get(tense) or {}
            expected = PERSONS if tense != "imperative" else PERSONS[1:]
            if impersonal:
                # An impersonal verb may also lack an imperative entirely
                # (reikė́ti "to be needed" has none in the book).
                if tense == "imperative":
                    continue
                expected = tuple(p for p in expected if p == "jis, ji, jie, jos")
            absent = [p for p in expected if not persons.get(p)]
            if absent:
                failures.append(f"#{num} {inf}: {tense} missing {absent}")

        for tense, persons in conj.items():
            if not isinstance(persons, dict):
                continue
            for person, form in persons.items():
                if not isinstance(form, str) or not form:
                    continue
                # 1. Nothing but combining marks.
                if not base_letters(form):
                    failures.append(
                        f"#{num} {inf}: {tense}/{person} is marks-only: {form!r}")
                # 2. No stray whitespace inside a form.
                bare = form.replace(" / ", "")
                if bare.startswith("tegu "):
                    bare = bare[5:]
                if " " in bare and "," not in form:
                    failures.append(
                        f"#{num} {inf}: {tense}/{person} has an inner space: {form!r}")

        # 3. Cross-tense duplication — the column-shift signature.
        cond, past, pres = (conj.get(k) or {} for k in
                            ("conditional", "indicative_past_simple", "indicative_present"))
        for person in PERSONS:
            if cond.get(person) and cond.get(person) == past.get(person):
                failures.append(
                    f"#{num} {inf}: conditional/{person} duplicates past_simple: "
                    f"{cond[person]!r}")
            # būti is suppletive: its past and present legitimately share nothing,
            # but other verbs sharing a cell means a column did not advance.
            if base_letters(inf).lower() != "buti":
                if past.get(person) and past.get(person) == pres.get(person):
                    failures.append(
                        f"#{num} {inf}: past_simple/{person} duplicates present: "
                        f"{past[person]!r}")
    return failures


# ── Soft checks (review list, never gate) ─────────────────────────────────────

def check_soft(verbs: list[dict]) -> list[str]:
    notes: list[str] = []
    for v in verbs:
        num, inf = v.get("number"), v.get("infinitive", "")
        conj = v.get("conjugations") or {}
        stem = stem_of(inf)
        reflexive = base_letters(inf).lower().endswith("tis")

        for tense, endings in REGULAR_ENDINGS.items():
            persons = conj.get(tense) or {}
            for person, form in persons.items():
                if not form:
                    continue
                alts = [a.strip() for a in form.split("/") if a.strip()]
                ok = False
                for alt in alts:
                    folded = base_letters(alt).lower()
                    for end in endings:
                        tail = base_letters(end).lower()
                        if folded.endswith(tail) or (
                            reflexive and (folded.endswith(tail + "si")
                                           or folded.endswith(tail + "s"))
                        ):
                            ok = True
                if not ok:
                    notes.append(f"#{num} {inf}: {tense}/{person} = {form!r} "
                                 f"(irregular ending)")

        for tense, persons in conj.items():
            if not isinstance(persons, dict):
                continue
            for person, form in persons.items():
                if not form:
                    continue
                letters = base_letters(form).lower()
                if letters.startswith("tegu"):
                    letters = letters[4:]
                if stem and len(stem) >= 3 and not letters.startswith(stem[:3]):
                    notes.append(f"#{num} {inf}: {tense}/{person} = {form!r} "
                                 f"(does not share stem {stem[:3]!r})")
                if unicodedata.normalize("NFC", form) != form:
                    notes.append(f"#{num} {inf}: {tense}/{person} = {form!r} (not NFC)")
    return notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=("db", "json"), default="db")
    ap.add_argument("--soft", action="store_true", help="also print the review list")
    args = ap.parse_args()

    verbs = load_json() if args.source == "json" else load_db()
    print(f"Validating {len(verbs)} verbs from {args.source}…\n")

    hard = check_hard(verbs)
    if hard:
        print(f"HARD FAILURES: {len(hard)}")
        kinds = Counter(f.split(": ", 1)[1].split(":")[0].split(" is ")[0][:40]
                        for f in hard)
        for kind, n in kinds.most_common():
            print(f"   {n:5}  {kind}")
        print()
        for f in hard[:40]:
            print("   ", f)
        if len(hard) > 40:
            print(f"    … and {len(hard) - 40} more")
    else:
        print("HARD CHECKS: all passed ✓")

    if args.soft:
        soft = check_soft(verbs)
        print(f"\nSOFT REVIEW ITEMS: {len(soft)}")
        for n in soft[:60]:
            print("   ", n)
        if len(soft) > 60:
            print(f"    … and {len(soft) - 60} more")

    sys.exit(1 if hard else 0)


if __name__ == "__main__":
    main()
