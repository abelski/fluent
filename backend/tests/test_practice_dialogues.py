"""#62c — Dialogues: validator, seed, `kind` on admin CRUD/export/import, ordered whole-test serving."""
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

DATA = json.loads((_BACKEND / "data" / "practice" / "dialogues.json").read_text(encoding="utf-8"))
_SECRET = "fluent-local-secret-change-in-prod"
ADMIN = {"Authorization": "Bearer " + jwt.encode(
    {"email": "artyrbelski@gmail.com", "name": "x", "picture": None}, _SECRET, algorithm="HS256")}
_TITLE = "DLG62c-"  # prefix of every test this module creates outside the seed


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


def _create(client, **kw):
    body = {"title_ru": _TITLE + kw.pop("title", "t"), **kw}
    r = client.post("/api/admin/practice/tests", json=body, headers=ADMIN)
    return r


# ── Validator ─────────────────────────────────────────────────────────────────

def test_validator_accepts_data_file():
    seed_mod.validate(DATA)


@pytest.mark.parametrize("mutate", [
    lambda d: d["tests"].pop(),
    lambda d: d["tests"][0].update(kind="choice"),
    lambda d: d["tests"][0].update(title_en=""),
    lambda d: d["tests"][0]["questions"].__delitem__(slice(1, None)),
    lambda d: d["tests"][0]["questions"][0].update(question_lt="Vaistininkė: be žvaigždučių"),
    lambda d: d["tests"][0]["questions"][0]["options"].pop(),
    lambda d: d["tests"][0]["questions"][0]["options"].__setitem__(1, d["tests"][0]["questions"][0]["options"][0]),
    lambda d: d["tests"][0]["questions"][0]["options"].__setitem__(1, " "),
    lambda d: d["tests"][0]["questions"][0].update(correct_option="e"),
    lambda d: d["tests"][0]["questions"][0].pop("source"),
    lambda d: [q.update(correct_option="a") for q in d["tests"][0]["questions"]],
])
def test_validator_rejects_broken_copies(mutate):
    d = copy.deepcopy(DATA)
    mutate(d)
    with pytest.raises(ValueError):
        seed_mod.validate(d)


# ── Seed ──────────────────────────────────────────────────────────────────────

def test_seed_dialogue_path(seeded):
    tests = _tests_of(seeded)
    assert len(tests) == 10
    with Session(_test_engine) as s:
        for t, src in zip(tests, DATA["tests"]):
            assert t.kind == "dialogue" and t.lesson_text_lt is None and t.status == "testing"
            assert t.question_count == len(src["questions"])
            qs = s.exec(select(PracticeQuestion).where(PracticeQuestion.test_id == t.id)
                        .order_by(PracticeQuestion.sort_order)).all()
            for q, sq in zip(qs, src["questions"]):
                assert [q.option_a, q.option_b, q.option_c, q.option_d] == sq["options"]
                assert q.question_lt == q.question_ru == sq["question_lt"]
                assert q.correct_option == sq["correct_option"]


# ── Serving ───────────────────────────────────────────────────────────────────

def test_dialogue_exam_returns_every_turn_in_order(client, seeded):
    t = _tests_of(seeded)[0]
    expected = [q["question_lt"] for q in DATA["tests"][0]["questions"]]
    for _ in range(5):
        body = client.get(f"/api/practice/tests/{t.id}/exam", headers=ADMIN).json()
        assert body["test"]["kind"] == "dialogue"
        assert [q["question_lt"] for q in body["questions"]] == expected


def test_choice_exam_still_samples(client):
    tid = _create(client, title="choice", question_count=2, status="published").json()["id"]
    for i in range(5):
        client.post(f"/api/admin/practice/tests/{tid}/questions", headers=ADMIN, json={
            "question_ru": f"q{i}", "option_a": "a", "option_b": "b", "option_c": "c", "option_d": "d",
            "correct_option": "a", "sort_order": i})
    body = client.get(f"/api/practice/tests/{tid}/exam", headers=ADMIN).json()
    assert body["test"]["kind"] == "choice" and len(body["questions"]) == 2


def test_category_tests_summary_has_kind(client, seeded):
    rows = client.get(f"/api/practice/categories/{seeded}/tests", headers=ADMIN).json()
    rows = rows["tests"] if isinstance(rows, dict) else rows
    assert rows and all(r["kind"] == "dialogue" for r in rows)


# ── Admin ─────────────────────────────────────────────────────────────────────

def test_create_and_update_reject_unknown_kind(client):
    assert _create(client, kind="nope").status_code == 400
    tid = _create(client).json()["id"]
    assert client.patch(f"/api/admin/practice/tests/{tid}", json={"kind": "nope"}, headers=ADMIN).status_code == 400


def test_admin_lists_return_kind_and_update_keeps_it(client, seeded):
    tid = _create(client, kind="dialogue").json()["id"]
    assert client.patch(f"/api/admin/practice/tests/{tid}", json={"title_en": "x"}, headers=ADMIN).status_code == 200
    rows = client.get("/api/admin/practice/tests", headers=ADMIN).json()
    assert next(r for r in rows if r["id"] == tid)["kind"] == "dialogue"
    rows = client.get(f"/api/admin/practice/categories/{seeded}/tests", headers=ADMIN).json()
    assert rows and all(r["kind"] == "dialogue" for r in rows)


def _import(client, payload):
    return client.post("/api/admin/practice/tests/import", headers=ADMIN,
                       files={"file": ("t.json", json.dumps(payload).encode(), "application/json")})


def test_export_import_round_trip(client):
    tid = _create(client, kind="dialogue", lesson_text_lt="Tekstas.").json()["id"]
    exported = client.get(f"/api/admin/practice/tests/{tid}/export", headers=ADMIN).json()
    assert exported["kind"] == "dialogue" and exported["lesson_text_lt"] == "Tekstas."
    new_id = _import(client, exported).json()["test_id"]
    with Session(_test_engine) as s:
        t = s.get(PracticeTest, new_id)
        assert t.kind == "dialogue" and t.lesson_text_lt == "Tekstas."


def test_import_without_kind_is_choice_and_unknown_is_400(client):
    new_id = _import(client, {"title_ru": _TITLE + "imp", "questions": []}).json()["test_id"]
    with Session(_test_engine) as s:
        assert s.get(PracticeTest, new_id).kind == "choice"
    assert _import(client, {"title_ru": _TITLE + "bad", "kind": "nope"}).status_code == 400
