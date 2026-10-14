"""#62h — grammar program «Время и количество»: data, new nouns, seed, tasks, visibility.

Drives the real generators over the real seed data (backend/data/grammar/programs/time_quantity.json)
inserted into the SQLite test DB by the real seed function.
"""
import importlib.util
import json
import random
from pathlib import Path

import pytest
from jose import jwt
from sqlmodel import Session, select

import routers.grammar as grammar_router
from conftest import _test_engine
from data.grammar.lessons import CASE_INFO, LESSON_CONFIG
from grammar_service import WORDS, _instruction, _generate_declension_tasks, _generate_sentence_tasks
from models import GrammarCaseRule, GrammarProgram, GrammarSentence, UserGrammarProgram

BACKEND = Path(__file__).resolve().parent.parent
DATA = json.loads((BACKEND / "data/grammar/programs/time_quantity.json").read_text(encoding="utf-8"))
TQ_CASES = [31, 32, 33, 34]
TQ_LESSONS = [row[0] for row in LESSON_CONFIG if set(row[2]) <= set(TQ_CASES)]
NEW_STEMS = ["kav", "pien", "duon", "sviest", "cukr", "drusk", "sūr", "arbat", "vyn", "mės",
             "saldain", "kiaušin", "bulv", "pomidor"]
MASS = NEW_STEMS[:10]
TITLE = "Время и количество"
_SECRET = "fluent-local-secret-change-in-prod"
ADMIN = {"Authorization": "Bearer " + jwt.encode({"email": "artyrbelski@gmail.com", "name": "x", "picture": None}, _SECRET, algorithm="HS256")}
FREE = {"Authorization": "Bearer " + jwt.encode({"email": "tq62h-free@example.com", "name": "x", "picture": None}, _SECRET, algorithm="HS256")}


def _load_seed():
    spec = importlib.util.spec_from_file_location("seed_gp_62h", BACKEND / "scripts" / "seed_grammar_program.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


seed_mod = _load_seed()


def _lines(name):
    return [[f.strip() for f in l.split("\t") if f.strip()]
            for l in (BACKEND / "data/grammar" / name).read_text(encoding="utf-8").splitlines()
            if l.strip() and not l.startswith("#")]


def wipe():
    with Session(_test_engine) as s:
        progs = s.exec(select(GrammarProgram).where(GrammarProgram.title == TITLE)).all()
        ids = [p.id for p in progs]
        for row in s.exec(select(UserGrammarProgram).where(UserGrammarProgram.program_id.in_(ids))).all():
            s.delete(row)
        for model in (GrammarCaseRule, GrammarSentence):
            for row in s.exec(select(model).where(model.case_index.in_(TQ_CASES))).all():
                s.delete(row)
        s.commit()
        for p in progs:
            s.delete(p)
        s.commit()


def set_released(published: bool):
    with Session(_test_engine) as s:
        for r in s.exec(select(GrammarCaseRule).where(GrammarCaseRule.case_index.in_(TQ_CASES))).all():
            r.status = "published" if published else "testing"
            s.add(r)
        p = s.exec(select(GrammarProgram).where(GrammarProgram.title == TITLE)).one()
        p.is_public = published
        s.add(p)
        s.commit()


@pytest.fixture
def seeded():
    wipe()
    with Session(_test_engine) as s:
        stats = seed_mod.seed(s, DATA)
    yield stats
    wipe()


def _with(case, display, ending, full):
    bad = json.loads(json.dumps(DATA))
    row = next(s for s in bad["sentences"] if s["case_index"] == case)
    row.update(display=display, answer_ending=ending, full_word=full)
    return bad


# ── Data ──────────────────────────────────────────────────────────────────────

def test_validator_passes_on_seed_data():
    seed_mod.validate(DATA)


def test_validator_rejects_bad_rows():
    with pytest.raises(ValueError, match="paradigm"):  # indeclinable cardinal, no options
        seed_mod.validate(_with(32, "Dirbu iki penkiolik___.", "os", "penkiolikos"))
    with pytest.raises(ValueError, match="ordinal"):  # cardinal in "Kelinta valanda?"
        seed_mod.validate(_with(31, "Dabar tr___ valandos.", "ys", "trys"))
    with pytest.raises(ValueError, match="paradigm"):  # a word with no options at all
        seed_mod.validate(_with(33, "Duok man puodelį sult___.", "ų", "sultų"))
    with pytest.raises(ValueError, match="plural"):  # Gen sg in the Gen pl topic
        seed_mod.validate(_with(34, "Duok man kilogramą mės___.", "os", "mėsos"))
    bad = json.loads(json.dumps(DATA))
    bad["sentences"][0]["source"] = ""
    with pytest.raises(ValueError, match="source"):
        seed_mod.validate(bad)


def test_new_noun_rows_complete():
    rows = {w[0]: w for w in WORDS}
    for stem in NEW_STEMS:
        assert len(rows[stem]) == 17 and rows[stem][15] and rows[stem][16]  # stem + 14 + EN + RU
    for stem in MASS:
        assert all(e.startswith("!") for e in rows[stem][8:15]), stem


def test_new_nouns_collide_with_nothing():
    def forms(w):
        return {(w[0] + e).lower() for e in w[1:15] if not e.startswith("!")}
    new = [w for w in WORDS if w[0] in NEW_STEMS]
    others = set().union(*(forms(w) for w in WORDS if w[0] not in NEW_STEMS))
    others |= {f.lower() for l in _lines("paradigms_extra.txt") + _lines("adjectives.txt") for f in l}
    for w in new:
        assert not (forms(w) | {w[0].lower()}) & others, w[0]


def test_declension_drills_never_serve_a_blocked_form():
    random.seed(0)
    rows = {w[0] + w[1]: w for w in WORDS if w[0] in NEW_STEMS}
    col = {v: k for k, v in CASE_INFO.items() if k <= 14}  # (case name, number) -> column
    served = 0
    for _ in range(50):
        for t in _generate_declension_tasks(list(range(1, 15)), 30):
            w = rows.get(t["prompt_lt"])
            if w:
                served += 1
                assert not w[col[(t["case_name"], t["number"])]].startswith("!"), t
    assert served


def test_lessons_config():
    assert [CASE_INFO[c][1] for c in TQ_CASES] == ["Laikas ir kiekis"] * 4
    assert TQ_LESSONS == [i for b in (166, 172, 178, 184) for i in (b, b + 1, b + 2)]
    ids = [row[0] for row in LESSON_CONFIG]
    assert len(ids) == len(set(ids)) and max(TQ_LESSONS) < 200


# ── Tasks ─────────────────────────────────────────────────────────────────────

def test_basic_tasks_have_four_options_and_quantity_hint(seeded):
    with Session(_test_engine) as s:
        for c in TQ_CASES:
            tasks = _generate_sentence_tasks([c], 24, s, "basic")
            assert tasks
            for t in tasks:
                assert len(t["options"]) == 4 and t["answer"] in t["options"]
                if c >= 33:
                    assert t["base_lt"]


# ── Visibility ────────────────────────────────────────────────────────────────

def _lesson_ids(client, headers):
    return {l["id"] for l in client.get("/api/grammar/lessons", headers=headers).json()}


def test_testing_rules_hide_lessons_from_free_users(client, seeded):
    assert not (_lesson_ids(client, FREE) & set(TQ_LESSONS))
    assert set(TQ_LESSONS) <= _lesson_ids(client, ADMIN)


def test_program_maps_to_its_lessons_only(seeded):
    set_released(True)
    with Session(_test_engine) as s:
        progs = {p.title: p for p in grammar_router._grammar_programs(s)}
        assert sorted(grammar_router._program_lesson_ids(progs[TITLE], s)) == TQ_LESSONS
        for title, p in progs.items():
            if title != TITLE and p.lesson_filter:
                assert not set(grammar_router._program_lesson_ids(p, s)) & set(TQ_LESSONS)


def test_seed_is_rerunnable(seeded):
    assert seeded["rules"] == 4 and seeded["sentences"] == len(DATA["sentences"])
    with Session(_test_engine) as s:
        again = seed_mod.seed(s, DATA)
        assert s.get(GrammarProgram, again["program_id"]).is_public is False
    assert again["rules"] == 0 and again["sentences"] == 0


def test_instruction_line():
    exp = {31: ("именительный падеж", "nominative"), 32: ("родительный падеж", "genitive"),
           33: ("родительный падеж, ед. ч.", "genitive, singular"),
           34: ("родительный падеж, мн. ч.", "genitive, plural")}
    for case, (ru, en) in exp.items():
        assert _instruction("cases", [case], True) == (f"Выбери правильную форму: {ru}", f"Pick the right form: {en}")
        assert _instruction("cases", [case], False) == (f"Впиши правильную форму: {ru}", f"Type the right form: {en}")
