# Plan #60 — grammar Basic: pick the right form from 4 options of one paradigm.
#
# Options are built server-side in grammar_service (`_pick_options`,
# `_paradigm_forms`, `_sentence_options`, `_verb_distractors`,
# `_verb_case_options`). Only `level == "basic"` gets them; advanced/practice
# never do. See documentation/grammar-basic-options.md.

import json
from pathlib import Path

import pytest
from sqlmodel import Session

import database as _db
from data.grammar.lessons import LESSON_CONFIG
from grammar_service import (
    VERB_LESSON_CONFIG,
    _generate_sentence_tasks,
    _generate_verb_case_tasks,
    _generate_verb_conjugation_tasks,
    _option_key,
    _pick_options,
    _verb_case_options,
    get_lesson_tasks,
    get_verb_lesson_tasks,
)
from models import GrammarSentence, Verb

Verb.__table__.create(_db.engine, checkfirst=True)

_CASE = 9601  # sentinel case_index, unused by other test files

# Realistic basic rows, one or more per real case (copied from the dev DB).
_SWEEP_ROWS = [
    (2, "Nėra brol___.", "io", "brolio"),
    (3, "Duodu brol___ knygą.", "iui", "broliui"),
    (4, "Laima mato brol___.", "į", "brolį"),
    (4, "Skaitau knyg___.", "ą", "knygą"),
    (5, "Rašau su brol___.", "iu", "broliu"),
    (6, "Gyvenu nam___.", "e", "name"),
    (7, "Labas, brol___!", "i", "broli"),
    (8, "Čia gyvena brol___.", "iai", "broliai"),
    (9, "Nėra brol___.", "ių", "brolių"),
    (10, "Duodu brol___.", "iams", "broliams"),
    (11, "Matau brol___.", "ius", "brolius"),
    (12, "Einu su brol___.", "iais", "broliais"),
    (13, "Gyvenu nam___.", "uose", "namuose"),
    (13, "Matau dant___.", "is", "dantis"),
    (15, "Renginyje buvo ___ merginos.", "aštuonios", "aštuonios"),
    (15, "___ gydytojai dirba ligoninėje.", "Aštuoni", "Aštuoni"),
    (15, "Kambaryje yra ___ lovos.", "dvi", "dvi"),
    (15, "Šeimoje yra ___ vaikai.", "trys", "trys"),
    (16, "Andrius turi ___ dukterį.", "vieną", "vieną"),
    (16, "Jis turi ___ brolius.", "devynis", "devynis"),
    (17, "Važiuoju dvidešimt pirm___ autobusu.", "u", "dvidešimt pirmu"),
    (17, "Antr___ troleibusu važiuoji pas mamą?", "u", "antru"),
    (17, "Važiuoju treč___ autobusu.", "iu", "trečiu"),
    (18, "Kelintame aukšte gyveni? — Šešt___!", "ame", "Šeštame"),
    (18, "Paskaita dvidešimt pirm___ auditorijoje.", "oje", "dvidešimt pirmoje"),
    (19, "Susitinkame pusę treč___.", "ios", "trečios"),
    (19, "Susitinkame dvidešimt___ valandą.", "ą", "dvidešimtą"),
    (20, "Man ___ metai. (21)", "dvidešimt vieni", "dvidešimt vieni"),
    (20, "Katei ___ metai. (1)", "vieni", "vieni"),
    (20, "Sūnui ___ metų. (10)", "dešimt", "dešimt"),
    (20, "___ trisdešimt dveji metai. (jis)", "Jam", "Jam"),
    (20, "Kiek ___ metų? (mama)", "mamai", "mamai"),
]

_DIRBTI = {
    "indicative_present": {"aš": "dìrbu", "tu": "dirbì", "jis, ji, jie, jos": "dìrba",
                           "mes": "dìrbame", "jūs": "dìrbate"},
    "indicative_past_simple": {"aš": "dìrbau", "tu": "dìrbai", "jis, ji, jie, jos": "dìrbo",
                               "mes": "dìrbome", "jūs": "dìrbote"},
    "indicative_past_habitual": {"aš": "dirbdavau", "tu": "dirbdavai", "jis, ji, jie, jos": "dirbdavo",
                                 "mes": "dirbdavome", "jūs": "dirbdavote"},
    "indicative_future": {"aš": "dirbsiu", "tu": "dirbsi", "jis, ji, jie, jos": "dirbs",
                          "mes": "dirbsime", "jūs": "dirbsite"},
    "conditional": {"aš": "dirbčiau", "tu": "dirbtum", "jis, ji, jie, jos": "dirbtų",
                    "mes": "dirbtume", "jūs": "dirbtute"},
    "imperative": {"tu": "dirbk", "mes": "dirbkime", "jūs": "dirbkite"},
}
_GOVERNANCE = [
    {"question": "kо?", "sentences": [{"lt": "Laukiu draugo.", "ru": "Жду друга."}]},  # Cyrillic о
    {"question": "ką? ko?", "sentences": [{"lt": "Noriu duonos.", "ru": "Хочу хлеба."}]},
]
_JUNK_GOVERNANCE = [{"question": "что?", "sentences": [{"lt": "Darau.", "ru": "Делаю."}]}]


def _add_sentence(s: Session, case_index: int, display: str, ending: str, full: str) -> GrammarSentence:
    row = GrammarSentence(case_index=case_index, display=display, answer_ending=ending,
                          full_word=full, russian="—", archived=False,
                          use_in_basic=True, use_in_advanced=True, use_in_practice=True)
    s.add(row)
    return row


@pytest.fixture()
def one_row():
    """Insert a single row at the sentinel case; yield a helper that sets it."""
    ids: list[int] = []

    def make(display: str, ending: str, full: str) -> None:
        with Session(_db.engine) as s:
            row = _add_sentence(s, _CASE, display, ending, full)
            s.commit()
            ids.append(row.id)

    yield make
    with Session(_db.engine) as s:
        for i in ids:
            s.delete(s.get(GrammarSentence, i))
        s.commit()


def _basic(n: int = 10, level: str = "basic") -> list[dict]:
    with Session(_db.engine) as s:
        return _generate_sentence_tasks([_CASE], n, s, level=level)


def _assert_valid_options(task: dict) -> None:
    opts = task["options"]
    assert len(opts) == 4, opts
    assert len({_option_key(o) for o in opts}) == 4, opts
    assert opts.count(task["answer"]) == 1, (task["answer"], opts)


# ── (a)–(h) sentence tasks ───────────────────────────────────────────────────

def test_a_noun_row_gets_four_full_word_options(one_row):
    one_row("Laima mato brol___.", "į", "brolį")
    for t in _basic():
        _assert_valid_options(t)
        assert t["display"] == "Laima mato ___."
        assert t["answer"] == "brolį"
        assert all(o.startswith("brol") for o in t["options"])


def test_b_ogonek_forms_stay_distinct_tone_and_case_collapse():
    opts = _pick_options("ranką", ["ranka", "rankos", "rankai"])
    assert sorted(opts) == sorted(["ranką", "ranka", "rankos", "rankai"])
    assert _pick_options("dìrbu", ["dirbu", "DIRBU", "dirba", "dirbi"]) is None
    assert _pick_options("Antru", ["antru", "antras", "antro", "antram"]).count("Antru") == 1


def test_c_irregular_bang_forms_never_offered(one_row):
    one_row("Matau dant___.", "is", "dantis")
    for _ in range(20):
        for t in _basic():
            _assert_valid_options(t)
            assert all("!" not in o for o in t["options"])
            assert "dantiui" not in t["options"]


def test_d_ordinal_prefix_stays_in_display(one_row):
    one_row("Važiuoju dvidešimt pirm___ autobusu.", "u", "dvidešimt pirmu")
    for t in _basic():
        _assert_valid_options(t)
        assert t["display"] == "Važiuoju dvidešimt ___ autobusu."
        assert t["answer"] == "pirmu"
        assert all(" " not in o for o in t["options"])


def test_e_capitalized_answer_gets_capitalized_options(one_row):
    one_row("___ gydytojai dirba ligoninėje.", "Aštuoni", "Aštuoni")
    for t in _basic():
        _assert_valid_options(t)
        assert all(o[0].isupper() for o in t["options"])
        assert "aštuoni" not in t["options"]


def test_f_multiword_answer_keeps_prefix(one_row):
    one_row("Man ___ metai. (21)", "dvidešimt vieni", "dvidešimt vieni")
    for t in _basic():
        _assert_valid_options(t)
        assert t["display"] == "Man ___ metai. (21)"
        assert all(o.startswith("dvidešimt ") for o in t["options"])


def test_g_unresolvable_answer_stays_typing(one_row):
    one_row("Sūnui ___ metų. (10)", "dešimt", "dešimt")
    for t in _basic():
        assert "options" not in t
        assert t["display"] == "Sūnui ___ metų. (10)"
        assert t["answer"] == "dešimt"


def test_g_basic_without_options_keeps_ending_only_shape(one_row):
    # A stem in no paradigm: today's basic shape, stem shown, ending graded.
    one_row("Matau zzz___.", "ą", "zzzą")
    for t in _basic():
        assert "options" not in t
        assert t["display"] == "Matau zzz___."
        assert t["answer"] == "ą"


@pytest.mark.parametrize("level", ["advanced", "practice"])
def test_h_other_levels_never_carry_options(one_row, level):
    one_row("Laima mato brol___.", "į", "brolį")
    for t in _basic(level=level):
        assert "options" not in t


# ── (i)–(j) verbs ────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def verbs():
    with Session(_db.engine) as s:
        rows = [
            Verb(number=9601, infinitive="dìrbti", present_3p="dìrba", past_3p="dìrbo",
                 translation_ru="работать", programs=json.dumps(["sekmes"]),
                 conjugations=json.dumps(_DIRBTI, ensure_ascii=False),
                 case_governance=json.dumps(_GOVERNANCE, ensure_ascii=False)),
            Verb(number=9602, infinitive="darýti", present_3p="dãro", past_3p="dãrė",
                 translation_ru="делать", programs=json.dumps([]),
                 case_governance=json.dumps(_JUNK_GOVERNANCE, ensure_ascii=False)),
        ]
        s.add_all(rows)
        s.commit()
        ids = [v.id for v in rows]
    yield ids
    with Session(_db.engine) as s:
        for i in ids:
            s.delete(s.get(Verb, i))
        s.commit()


@pytest.mark.parametrize("tense", list(_DIRBTI))
def test_i_verb_basic_options(verbs, tense):
    with Session(_db.engine) as s:
        tasks = _generate_verb_conjugation_tasks(tense, 40, s, None, level="basic")
    mine = [t for t in tasks if t["verb_infinitive"] == "dìrbti"]
    assert mine
    for t in mine:
        _assert_valid_options(t)
    with Session(_db.engine) as s:
        adv = _generate_verb_conjugation_tasks(tense, 10, s, None)
    assert all("options" not in t for t in adv)


def test_j_verb_case_options(verbs):
    with Session(_db.engine) as s:
        tasks = _generate_verb_case_tasks(60, s, level="basic")
    by_verb = {t["verb_infinitive"]: [] for t in tasks}
    for t in tasks:
        by_verb[t["verb_infinitive"]].append(t)
    for t in by_verb["dìrbti"]:
        assert "о" not in t["answer"]
        assert t["answer"] in ("ko?", "ką? ko?")
        _assert_valid_options(t)
        others = [o for o in t["options"] if o != t["answer"]]
        assert not set(others) & set(t["answer"].split())
    for t in by_verb.get("darýti", []):
        assert "options" not in t
    with Session(_db.engine) as s:
        assert all("options" not in t for t in _generate_verb_case_tasks(20, s))



def test_j_verb_case_options_keep_negated_verb_prefix():
    for _ in range(20):
        opts = _verb_case_options("nerašýti ko?")
        assert opts and len(opts) == 4
        assert all(o.startswith("nerašýti ") for o in opts)
        assert opts.count("nerašýti ko?") == 1
        assert len(set(opts)) == 4
    assert _verb_case_options("nesišukúoti?") is None


# ── (k) numeral table ────────────────────────────────────────────────────────

def test_k_every_extra_paradigm_has_four_distinct_forms():
    path = Path(__file__).parent.parent / "data/grammar/paradigms_extra.txt"
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip() and not line.startswith("#"):
            assert len({_option_key(f) for f in line.split("\t") if f.strip()}) >= 4, line


# ── (l) all-lessons sweep, (m) API ───────────────────────────────────────────

@pytest.fixture(scope="module")
def sweep_rows():
    with Session(_db.engine) as s:
        rows = [_add_sentence(s, *r) for r in _SWEEP_ROWS]
        s.commit()
        ids = [r.id for r in rows]
    yield
    with Session(_db.engine) as s:
        for i in ids:
            s.delete(s.get(GrammarSentence, i))
        s.commit()


def test_l_every_basic_lesson_serves_valid_options(sweep_rows, verbs):
    with_options = 0
    with Session(_db.engine) as s:
        for lesson in LESSON_CONFIG:
            if lesson[1] == "basic":
                for t in get_lesson_tasks(lesson[0], s):
                    if "options" in t:
                        with_options += 1
                        _assert_valid_options(t)
        for lid, cfg in VERB_LESSON_CONFIG.items():
            if cfg[1] == "basic":
                for t in get_verb_lesson_tasks(lid, s):
                    if "options" in t:
                        with_options += 1
                        _assert_valid_options(t)
    assert with_options > 100


def test_m_api_returns_options_for_basic_lesson(client, sweep_rows):
    r = client.get("/api/grammar/lessons/1/tasks")  # lesson 1 = case 4, basic
    assert r.status_code == 200
    tasks = r.json()
    assert tasks and all(len(t["options"]) == 4 for t in tasks)
