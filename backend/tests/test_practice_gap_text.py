"""#62d — Gap text: validator, seed, `kind` on admin CRUD/import, ordered whole-test serving."""
import copy
import importlib.util
import json
from pathlib import Path

import pytest
from jose import jwt
from sqlmodel import Session, select

from conftest import _test_engine
from models import PracticeCategory, PracticeQuestion, PracticeTest

_BACKEND = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("seed_practice_category", _BACKEND / "scripts" / "seed_practice_category.py")
seed_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seed_mod)

DATA = json.loads((_BACKEND / "data" / "practice" / "gap_text.json").read_text(encoding="utf-8"))
_SECRET = "fluent-local-secret-change-in-prod"
ADMIN = {"Authorization": "Bearer " + jwt.encode(
    {"email": "artyrbelski@gmail.com", "name": "x", "picture": None}, _SECRET, algorithm="HS256")}
_TITLE = "GAP62d-"


def _wipe():
    with Session(_test_engine) as s:
        tests = list(s.exec(select(PracticeTest).where(PracticeTest.title_ru.startswith(_TITLE))).all())
        cat = s.exec(select(PracticeCategory).where(PracticeCategory.name_ru == DATA["category"]["name_ru"])).first()
        if cat:
            tests += s.exec(select(PracticeTest).where(PracticeTest.category_id == cat.id)).all()
        for q in s.exec(select(PracticeQuestion).where(PracticeQuestion.test_id.in_([t.id for t in tests]))).all():
            s.delete(q)
        for t in tests:
            s.delete(t)
        if cat:
            s.delete(cat)
        s.commit()


@pytest.fixture(autouse=True)
def _clean():
    _wipe()
    yield
    _wipe()


@pytest.fixture
def seeded():
    with Session(_test_engine) as s:
        cat_id, created = seed_mod.seed(s, DATA)
    assert created
    return cat_id


def _tests_of(cat_id):
    with Session(_test_engine) as s:
        return s.exec(select(PracticeTest).where(PracticeTest.category_id == cat_id)
                      .order_by(PracticeTest.sort_order)).all()


# ── Validator ─────────────────────────────────────────────────────────────────

def test_validator_accepts_data_file():
    seed_mod.validate(DATA)


def _t0(d):
    return d["tests"][0]


@pytest.mark.parametrize("mutate", [
    # missing marker
    lambda d: _t0(d).update(lesson_text_lt=_t0(d)["lesson_text_lt"].replace("{3}", "x")),
    # duplicated marker
    lambda d: _t0(d).update(lesson_text_lt=_t0(d)["lesson_text_lt"].replace("{3}", "{2}")),
    # out-of-order markers
    lambda d: _t0(d).update(lesson_text_lt=_t0(d)["lesson_text_lt"].replace("{2}", "{X}").replace("{3}", "{2}").replace("{X}", "{3}")),
    # question_lt not matching its marker
    lambda d: _t0(d)["questions"][2].update(question_lt="{4}"),
    # equal option_a / option_b
    lambda d: _t0(d)["questions"][0].update(option_b=_t0(d)["questions"][0]["option_a"]),
    # distractor equal to another gap's answer
    lambda d: _t0(d)["questions"][0].update(option_b=_t0(d)["questions"][1]["option_a"]),
    lambda d: _t0(d)["questions"][0].update(option_c="x"),
    lambda d: _t0(d)["questions"][0].update(correct_option="b"),
    lambda d: _t0(d).update(kind="choice"),
    lambda d: _t0(d).update(title_en=""),
    lambda d: _t0(d).update(lesson_text_lt=_t0(d)["lesson_text_lt"] + " {oops}"),
    lambda d: d["tests"].pop(),
])
def test_validator_rejects_broken_copies(mutate):
    d = copy.deepcopy(DATA)
    mutate(d)
    with pytest.raises(ValueError):
        seed_mod.validate(d)


# ── Seed ──────────────────────────────────────────────────────────────────────

def test_seed_gap_text_path(seeded):
    tests = _tests_of(seeded)
    assert len(tests) == 8
    with Session(_test_engine) as s:
        assert s.get(PracticeCategory, seeded).sort_order == 13
        for i, (t, src) in enumerate(zip(tests, DATA["tests"]), 1):
            assert t.kind == "gap_text" and t.status == "testing" and t.sort_order == i
            assert t.lesson_text_lt == src["lesson_text_lt"]
            assert t.question_count == len(src["questions"])
            qs = s.exec(select(PracticeQuestion).where(PracticeQuestion.test_id == t.id)
                        .order_by(PracticeQuestion.sort_order)).all()
            for j, (q, sq) in enumerate(zip(qs, src["questions"]), 1):
                assert [q.option_a, q.option_b, q.option_c, q.option_d] == [sq["option_a"], sq["option_b"], "", ""]
                assert q.question_lt == q.question_ru == f"{{{j}}}"
                assert q.correct_option == "a" and q.sort_order == j


# ── Serving ───────────────────────────────────────────────────────────────────

def test_gap_text_exam_returns_all_gaps_in_order(client, seeded):
    t = _tests_of(seeded)[0]
    n = len(DATA["tests"][0]["questions"])
    for _ in range(5):
        body = client.get(f"/api/practice/tests/{t.id}/exam", headers=ADMIN).json()
        assert body["test"]["kind"] == "gap_text"
        assert [q["question_lt"] for q in body["questions"]] == [f"{{{j}}}" for j in range(1, n + 1)]


# ── Admin ─────────────────────────────────────────────────────────────────────

def test_admin_create_update_import_accept_gap_text(client):
    r = client.post("/api/admin/practice/tests", json={"title_ru": _TITLE + "c", "kind": "gap_text"}, headers=ADMIN)
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    assert client.patch(f"/api/admin/practice/tests/{tid}", json={"kind": "choice"}, headers=ADMIN).status_code == 200
    assert client.patch(f"/api/admin/practice/tests/{tid}", json={"kind": "gap_text"}, headers=ADMIN).status_code == 200
    assert client.patch(f"/api/admin/practice/tests/{tid}", json={"kind": "nope"}, headers=ADMIN).status_code == 400
    assert client.post("/api/admin/practice/tests", json={"title_ru": _TITLE + "x", "kind": "nope"},
                       headers=ADMIN).status_code == 400
    r = client.post("/api/admin/practice/tests/import", headers=ADMIN, files={"file": (
        "t.json", json.dumps({"title_ru": _TITLE + "imp", "kind": "gap_text", "questions": []}).encode(),
        "application/json")})
    with Session(_test_engine) as s:
        assert s.get(PracticeTest, r.json()["test_id"]).kind == "gap_text"
