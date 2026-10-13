"""#62f — grammar program «Прилагательные»: data, seed, tasks, visibility.

Drives the real generators over the real seed data (backend/data/grammar/programs/adjectives.json)
inserted into the SQLite test DB by the real seed function.
"""
import importlib.util
import json
from pathlib import Path

import pytest
from jose import jwt
from sqlmodel import Session, select

import routers.grammar as grammar_router
from conftest import _test_engine
from data.grammar.lessons import CASE_INFO, LESSON_CONFIG
from grammar_service import _generate_sentence_tasks, get_lesson_tasks
from models import GrammarCaseRule, GrammarProgram, GrammarSentence, UserGrammarProgram

BACKEND = Path(__file__).resolve().parent.parent
DATA = json.loads((BACKEND / "data/grammar/programs/adjectives.json").read_text(encoding="utf-8"))
ADJ_LINES = [l.split("\t") for l in (BACKEND / "data/grammar/adjectives.txt").read_text(encoding="utf-8").splitlines()
             if l.strip() and not l.startswith("#")]
ADJ_CASES = list(range(21, 27))
ADJ_LESSONS = [row[0] for row in LESSON_CONFIG if set(row[2]) <= set(ADJ_CASES)]
_SECRET = "fluent-local-secret-change-in-prod"
ADMIN = {"Authorization": "Bearer " + jwt.encode({"email": "artyrbelski@gmail.com", "name": "x", "picture": None}, _SECRET, algorithm="HS256")}
FREE = {"Authorization": "Bearer " + jwt.encode({"email": "adj62f-free@example.com", "name": "x", "picture": None}, _SECRET, algorithm="HS256")}
_NOUN_CASE = 9621  # sentinel case_index for noun/cleanup rows


def _load_seed():
    spec = importlib.util.spec_from_file_location("seed_gp", BACKEND / "scripts" / "seed_grammar_program.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


seed_mod = _load_seed()


def wipe():
    with Session(_test_engine) as s:
        progs = s.exec(select(GrammarProgram).where(GrammarProgram.title.in_(["Прилагательные", "Литовские падежи 62f"]))).all()
        ids = [p.id for p in progs]
        for row in s.exec(select(UserGrammarProgram).where(UserGrammarProgram.program_id.in_(ids))).all():
            s.delete(row)
        for model in (GrammarCaseRule, GrammarSentence):
            for row in s.exec(select(model).where(model.case_index.in_(ADJ_CASES + [_NOUN_CASE]))).all():
                s.delete(row)
        s.commit()
        for p in progs:
            s.delete(p)
        s.commit()


def set_released(published: bool):
    with Session(_test_engine) as s:
        for r in s.exec(select(GrammarCaseRule).where(GrammarCaseRule.case_index.in_(ADJ_CASES))).all():
            r.status = "published" if published else "testing"
            s.add(r)
        p = s.exec(select(GrammarProgram).where(GrammarProgram.title == "Прилагательные")).one()
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


# ── Data ──────────────────────────────────────────────────────────────────────

def test_validator_passes_on_seed_data():
    seed_mod.validate(DATA)


def test_validator_rejects_bad_rows():
    bad = json.loads(json.dumps(DATA))
    bad["sentences"][0]["source"] = ""
    with pytest.raises(ValueError, match="source"):
        seed_mod.validate(bad)
    bad = json.loads(json.dumps(DATA))
    bad["sentences"][0]["answer_ending"] += "x"
    with pytest.raises(ValueError):
        seed_mod.validate(bad)
    bad = json.loads(json.dumps(DATA))
    bad["sentences"].append(dict(bad["sentences"][0]))
    with pytest.raises(ValueError, match="duplicate"):
        seed_mod.validate(bad)


def test_adjectives_txt_first_columns_unique_and_full():
    firsts = [l[0] for l in ADJ_LINES]
    assert len(firsts) == len(set(firsts))
    assert all(len(l) == 25 for l in ADJ_LINES)  # dictionary form + 24 forms


def test_us_adjectives_alternate_t_d():
    line = {l[0]: l for l in ADJ_LINES}
    assert {"plačiam", "plačios", "platų", "plati", "platūs"} <= set(line["platus"])
    assert {"saldžiam", "saldžios", "saldų", "saldi"} <= set(line["saldus"])
    assert "didelė" in line["didelis"] and "didelėje" in line["didelis"]


def test_lessons_config():
    assert [CASE_INFO[c][1] for c in ADJ_CASES] == ["Būdvardžiai"] * 6
    assert ADJ_LESSONS == [i for b in range(106, 137, 6) for i in (b, b + 1, b + 2)]
    ids = [row[0] for row in LESSON_CONFIG]
    assert len(ids) == len(set(ids)) and max(ADJ_LESSONS) < 200


# ── Tasks ─────────────────────────────────────────────────────────────────────

def test_basic_task_options_and_hint(seeded):
    by_form = {f.lower(): l for l in ADJ_LINES for f in l}
    with Session(_test_engine) as s:
        tasks = _generate_sentence_tasks([22], 24, s, "basic")
    assert tasks
    for t in tasks:
        line = by_form[t["full_answer"].lower()]
        assert len(t["options"]) == 4 and t["answer"] in t["options"]
        assert {o.lower() for o in t["options"]} <= {f.lower() for f in line}
        assert t["base_lt"] == line[0]


def test_instruction_line(seeded):
    set_released(True)
    with Session(_test_engine) as s:
        tasks = get_lesson_tasks(112, s)  # Kilmininkas basic
    t = tasks[0]
    verb = ("Выбери", "Pick") if t.get("options") else ("Впиши", "Type")
    assert t["instruction_ru"] == f"{verb[0]} правильную форму прилагательного: родительный падеж"
    assert t["instruction_en"] == f"{verb[1]} the right form of the adjective: genitive"


def test_noun_row_unchanged_and_cleanup_removed(seeded):
    with Session(_test_engine) as s:
        s.add(GrammarSentence(case_index=_NOUN_CASE, display="Laima mato brol___.", answer_ending="į",
                              full_word="brolį", russian="Лайма видит брата."))
        s.commit()
        noun = _generate_sentence_tasks([_NOUN_CASE], 4, s, "basic")[0]
    assert noun["base_lt"] == "brolis"
    assert {o.lower() for o in noun["options"]} <= {"brolis", "brolio", "broliui", "brolį", "broliu", "brolyje",
                                                     "broli", "broliai", "brolių", "broliams", "brolius",
                                                     "broliais", "broliuose"}
    with Session(_test_engine) as s:
        for r in s.exec(select(GrammarSentence).where(GrammarSentence.case_index == _NOUN_CASE)).all():
            s.delete(r)
        s.add(GrammarSentence(case_index=_NOUN_CASE, display="Tai ger___ knyga, o filmas gera.", answer_ending="a",
                              full_word="gera", russian="x"))
        s.commit()
        t = _generate_sentence_tasks([_NOUN_CASE], 1, s, "advanced")[0]
    assert t["display"] == "Tai ger___ knyga, o filmas gera."


# ── Visibility ────────────────────────────────────────────────────────────────

def _lesson_ids(client, headers):
    return {l["id"] for l in client.get("/api/grammar/lessons", headers=headers).json()}


def test_testing_rules_hide_lessons_from_free_users(client, seeded):
    assert not (_lesson_ids(client, FREE) & set(ADJ_LESSONS))
    assert set(ADJ_LESSONS) <= _lesson_ids(client, ADMIN)


def test_program_lesson_ids_after_release(seeded):
    set_released(True)
    with Session(_test_engine) as s:
        cases_prog = GrammarProgram(title="Литовские падежи 62f", lesson_filter='["Vienaskaita","Daugiskaita"]')
        s.add(cases_prog)
        s.commit()
        progs = {p.title: p for p in grammar_router._grammar_programs(s)}
        adj = grammar_router._program_lesson_ids(progs["Прилагательные"], s)
        cases = grammar_router._program_lesson_ids(progs["Литовские падежи 62f"], s)
    assert sorted(adj) == ADJ_LESSONS
    assert not set(cases) & set(ADJ_LESSONS)


def test_seed_is_rerunnable(seeded):
    assert seeded["rules"] == 6 and seeded["sentences"] == len(DATA["sentences"])
    with Session(_test_engine) as s:
        again = seed_mod.seed(s, DATA)
        n = len(s.exec(select(GrammarSentence).where(GrammarSentence.case_index.in_(ADJ_CASES))).all())
        prog = s.get(GrammarProgram, again["program_id"])
        assert prog.is_public is False and json.loads(prog.lesson_filter) == ["Būdvardžiai"]
    assert again["rules"] == 0 and again["sentences"] == 0
    assert again["program_id"] == seeded["program_id"]
    assert n == len(DATA["sentences"])


def test_admin_previews_hidden_program(client, seeded):
    pid = seeded["program_id"]
    admin_list = client.get("/api/grammar-programs", headers=ADMIN).json()
    row = next(p for p in admin_list if p["id"] == pid)
    assert row["is_public"] is False
    assert pid not in {p["id"] for p in client.get("/api/grammar-programs", headers=FREE).json()}
    assert pid not in {p["id"] for p in client.get("/api/grammar-programs").json()}
    assert client.post(f"/api/me/grammar-programs/{pid}", headers=FREE).status_code == 404
    assert client.post(f"/api/me/grammar-programs/{pid}", headers=ADMIN).status_code == 200
    ids = [p["id"] for p in admin_list]
    assert ids == sorted(ids)


def test_llms_lists_public_grammar_programs_only(client, seeded):
    assert "- Adjectives (" not in client.get("/llms.txt").text
    set_released(True)
    assert "- Adjectives (18 lessons)" in client.get("/llms.txt").text
