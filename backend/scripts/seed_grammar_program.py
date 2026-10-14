"""Generic, re-runnable seed for a data-only grammar program (#62f; #62g/#62h add a format).

Usage:
    python scripts/seed_grammar_program.py data/grammar/programs/adjectives.json [--dry-run]

--dry-run validates the JSON (no database) and prints 10 sample sentences per case.
The real run inserts case rules (`testing`, admins only) and sentences only for case indices
that have none yet — a rerun never duplicates — and upserts the program by title
(new → `is_public` false; existing → updated in place, never deleted: enrollments reference it).
No --reset on purpose: later fixes go through the admin grammar editor.
See documentation/grammar-new-programs.md.
"""

import json
import os
import random
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

_RULE_FIELDS = ("name_ru", "name_en", "question", "question_en", "usage", "usage_en",
                "transform", "transform_en", "endings_sg", "endings_pl", "endings_sg_en", "endings_pl_en")
_SENTENCE_FIELDS = ("display", "answer_ending", "full_word", "russian", "english")


def _check_common(data: dict, case_indices: set[int]) -> None:
    p = data.get("program") or {}
    for key in ("title", "title_en", "description", "description_en", "lesson_filter"):
        if not p.get(key):
            raise ValueError(f"program.{key} required")
    rules = data.get("rules") or []
    if sorted(r.get("case_index") for r in rules) != sorted(case_indices):
        raise ValueError(f"rules must cover exactly case indices {sorted(case_indices)}")
    for r in rules:
        for key in _RULE_FIELDS:
            if not (r.get(key) or "").strip():
                raise ValueError(f"rule {r.get('case_index')}: {key} required")


def validate_adjectives(data: dict) -> None:
    """Raise ValueError if `data` breaks the adjective-program rules (plan #62f Req 7, 8)."""
    from data.grammar.lessons import CASE_INFO
    from grammar_service import (_ADJ_FORM_TO_FORMS, _EXTRA_FORM_TO_FORMS, _FORM_TO_NOMINATIVE,
                                 _extract_stem, _paradigm_forms, _sentence_base_lt,
                                 _sentence_invariant_holds)

    cases = {i for i, (_, group) in CASE_INFO.items() if group == "Būdvardžiai"}
    _check_common(data, cases)
    clash = sorted(f for f in _ADJ_FORM_TO_FORMS if f in _FORM_TO_NOMINATIVE or f in _EXTRA_FORM_TO_FORMS)
    if clash:
        raise ValueError(f"adjectives.txt forms also in words.txt/paradigms_extra.txt: {clash[:10]}")
    seen: set[str] = set()
    adjs: dict[int, set[str]] = defaultdict(set)
    counts: dict[int, int] = defaultdict(int)
    numbers: dict[int, set[str]] = defaultdict(set)
    for s in data.get("sentences") or []:
        where = f"sentence {s.get('display')!r}"
        if s.get("case_index") not in cases:
            raise ValueError(f"{where}: case_index {s.get('case_index')} is not a Būdvardžiai case")
        for key in _SENTENCE_FIELDS:
            if not (s.get(key) or "").strip():
                raise ValueError(f"{where}: {key} required")
        if not (s.get("source") or "").strip():
            raise ValueError(f"{where}: source required")
        if s["display"].count("___") != 1:
            raise ValueError(f"{where}: needs exactly one ___")
        if not _sentence_invariant_holds(s["display"], s["answer_ending"], s["full_word"]):
            raise ValueError(f"{where}: stem + answer_ending != full_word")
        line = _ADJ_FORM_TO_FORMS.get(s["full_word"].lower())
        if not line:
            raise ValueError(f"{where}: {s['full_word']!r} is not an unambiguous adjectives.txt form")
        if _paradigm_forms(s["full_word"]) != line or len({f.lower() for f in line}) < 4:
            raise ValueError(f"{where}: Basic options would not come from its adjectives.txt line")
        if _sentence_base_lt(s["full_word"], _extract_stem(s["display"])) != line[0]:
            raise ValueError(f"{where}: hint would not be {line[0]!r}")
        if s["display"] in seen:
            raise ValueError(f"{where}: duplicate display")
        seen.add(s["display"])
        c = s["case_index"]
        counts[c] += 1
        adjs[c].add(line[0])
        # Column order: masc sg (1-6), masc pl (7-12), fem sg (13-18), fem pl (19-24).
        idx = [i for i, f in enumerate(line[1:]) if f.lower() == s["full_word"].lower()]
        numbers[c].update("pl" if (i // 6) % 2 else "sg" for i in idx)
    for c in sorted(cases):
        if counts[c] < 30:
            raise ValueError(f"case {c}: {counts[c]} sentences, need ≥ 30")
        if len(adjs[c]) < 10:
            raise ValueError(f"case {c}: {len(adjs[c])} adjectives, need ≥ 10")
        if numbers[c] != {"sg", "pl"}:
            raise ValueError(f"case {c}: needs singular and plural sentences")


_ORDINAL_ENDS = ("tas", "pirmas", "antras", "trečias")  # paradigms_extra.txt ordinal lines
TIME_NOM, TIME_GEN, QTY_SG, QTY_PL = 31, 32, 33, 34  # CASE_INFO "Laikas ir kiekis" case indexes
MIN_PER_CASE = 25
_GEN_SG_COL, _GEN_PL_COL = 2, 9  # words.txt ending columns (1-14, as in grammar_service._FORM_TO_ROW)


def validate_time_quantity(data: dict) -> None:
    """Raise ValueError if `data` breaks the time-and-quantity rules (plan #62h Req 4)."""
    from data.grammar.lessons import CASE_INFO
    from grammar_service import (_FORM_TO_NOMINATIVE, _FORM_TO_ROW, _extract_stem, _paradigm_forms,
                                 _sentence_base_lt, _sentence_invariant_holds)

    cases = {i for i, (_, group) in CASE_INFO.items() if group == "Laikas ir kiekis"}
    _check_common(data, cases)
    if cases != {TIME_NOM, TIME_GEN, QTY_SG, QTY_PL}:
        raise ValueError(f"Laikas ir kiekis cases changed in CASE_INFO: {sorted(cases)}")
    seen: set[str] = set()
    counts: dict[int, int] = defaultdict(int)
    half = span = 0
    for s in data.get("sentences") or []:
        where = f"sentence {s.get('display')!r}"
        c = s.get("case_index")
        if c not in cases:
            raise ValueError(f"{where}: case_index {c} is not a Laikas ir kiekis case")
        for key in _SENTENCE_FIELDS:
            if not (s.get(key) or "").strip():
                raise ValueError(f"{where}: {key} required")
        if not (s.get("source") or "").strip():
            raise ValueError(f"{where}: source required")
        if s["display"].count("___") != 1:
            raise ValueError(f"{where}: needs exactly one ___")
        if not _sentence_invariant_holds(s["display"], s["answer_ending"], s["full_word"]):
            raise ValueError(f"{where}: stem + answer_ending != full_word")
        word = s["full_word"].lower()
        forms = _paradigm_forms(word)
        if len({f.lower() for f in forms}) < 4:
            raise ValueError(f"{where}: {word!r} has no paradigm line — Basic would have no options")
        if c in (TIME_NOM, TIME_GEN):
            if not forms[0].endswith(_ORDINAL_ENDS) or _FORM_TO_ROW.get(word):
                raise ValueError(f"{where}: time blanks must be ordinals, got {word!r}")
            low = s["display"].lower()
            half += c == TIME_GEN and "pusė " in low
            span += c == TIME_GEN and ("nuo " in low or "iki " in low)
        else:
            row = _FORM_TO_ROW.get(word)
            if not row:
                raise ValueError(f"{where}: {word!r} is not an unambiguous words.txt form")
            cols = [i for i in range(1, 15) if not row[i].startswith("!") and (row[0] + row[i]).lower() == word]
            if (c == QTY_SG and _GEN_SG_COL not in cols) or (c == QTY_PL and _GEN_PL_COL not in cols):
                raise ValueError(f"{where}: {word!r} is not the genitive {'singular' if c == QTY_SG else 'plural'}")
            nom = _FORM_TO_NOMINATIVE.get(word)
            if not nom or _sentence_base_lt(s["full_word"], _extract_stem(s["display"])) != nom:
                raise ValueError(f"{where}: hint would not be the nominative")
        if s["display"] in seen:
            raise ValueError(f"{where}: duplicate display")
        seen.add(s["display"])
        counts[c] += 1
    for c in sorted(cases):
        if counts[c] < MIN_PER_CASE:
            raise ValueError(f"case {c}: {counts[c]} sentences, need ≥ {MIN_PER_CASE}")
    if half < 8 or span < 8:
        raise ValueError(f"case {TIME_GEN}: pusė ×{half}, nuo/iki ×{span}, need ≥ 8 each")


def validate(data: dict) -> None:
    fmt = data.get("format")
    if fmt == "adjectives":
        validate_adjectives(data)
    elif fmt == "time_quantity":
        validate_time_quantity(data)
    else:
        raise ValueError(f"unknown format {fmt!r}")


def seed(session, data: dict) -> dict:
    """Insert missing rules/sentences, upsert the program. Returns counts and the program id."""
    from sqlmodel import select
    from models import GrammarCaseRule, GrammarProgram, GrammarSentence

    stats = {"rules": 0, "sentences": 0}
    for r in data["rules"]:
        c = r["case_index"]
        if not session.exec(select(GrammarCaseRule).where(GrammarCaseRule.case_index == c)).first():
            session.add(GrammarCaseRule(**{k: r[k] for k in ("case_index", *_RULE_FIELDS)},
                                        article_slug=r.get("article_slug"), status="testing"))
            stats["rules"] += 1
    have = set(session.exec(select(GrammarSentence.case_index).where(
        GrammarSentence.case_index.in_([r["case_index"] for r in data["rules"]]))).all())
    for s in data["sentences"]:
        if s["case_index"] in have:
            continue  # this case already has sentences — never duplicate
        session.add(GrammarSentence(case_index=s["case_index"], **{k: s[k] for k in _SENTENCE_FIELDS},
                                    use_in_basic=True, use_in_advanced=True, use_in_practice=True))
        stats["sentences"] += 1
    p = data["program"]
    fields = dict(title=p["title"], title_en=p["title_en"], description=p["description"],
                  description_en=p["description_en"], difficulty=p.get("difficulty", 1),
                  lesson_filter=json.dumps(p["lesson_filter"], ensure_ascii=False),
                  program_type=p.get("program_type", "cases"))
    prog = session.exec(select(GrammarProgram).where(GrammarProgram.title == p["title"])).first()
    if prog:
        for k, v in fields.items():  # is_public is left alone: releasing is an admin step
            setattr(prog, k, v)
    else:
        prog = GrammarProgram(**fields, is_public=False)
    session.add(prog)
    session.commit()
    stats["program_id"] = prog.id
    return stats


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
    by_case = defaultdict(list)
    for s in data["sentences"]:
        by_case[s["case_index"]].append(s)
    print(f"Valid: {len(data['rules'])} rules, {len(data['sentences'])} sentences, program {data['program']['title']!r}.")
    if "--dry-run" in argv:
        rng = random.Random(0)
        for c, rows in sorted(by_case.items()):
            print(f"\n== case {c}: {len(rows)} sentences")
            for s in rng.sample(rows, min(10, len(rows))):
                print(f"  {s['display']}  [{s['full_word']}]  — {s['russian']} / {s['english']}  ({s['source']})")
        print("\nDry run — database not touched.")
        return 0

    from sqlmodel import Session
    from database import engine

    with Session(engine) as session:
        stats = seed(session, data)
    print(f"Inserted {stats['rules']} rules (testing), {stats['sentences']} sentences; "
          f"program id={stats['program_id']} (hidden until an admin makes it public).")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
