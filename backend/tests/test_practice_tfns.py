"""#62b — True / False / Not stated: validator, insert-only seed, hidden until published."""
import copy
import importlib.util
import json
from pathlib import Path

import pytest
from jose import jwt
from sqlmodel import Session, select

from conftest import _test_engine
from models import PracticeCategory, PracticeQuestion, PracticeTest, User

_BACKEND = Path(__file__).resolve().parent.parent
_spec = importlib.util.spec_from_file_location("seed_practice_category", _BACKEND / "scripts" / "seed_practice_category.py")
seed_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seed_mod)

DATA = json.loads((_BACKEND / "data" / "practice" / "tfns.json").read_text(encoding="utf-8"))
_SECRET = "fluent-local-secret-change-in-prod"
_FREE = "tfns62-free"


def _auth(email: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"email": email, "name": "x", "picture": None}, _SECRET, algorithm="HS256")}


ADMIN = _auth("artyrbelski@gmail.com")
FREE = _auth(f"{_FREE}@example.com")


def _wipe():
    with Session(_test_engine) as s:
        cat = s.exec(select(PracticeCategory).where(PracticeCategory.name_ru == DATA["category"]["name_ru"])).first()
        if cat:
            tests = s.exec(select(PracticeTest).where(PracticeTest.category_id == cat.id)).all()
            for q in s.exec(select(PracticeQuestion).where(PracticeQuestion.test_id.in_([t.id for t in tests]))).all():
                s.delete(q)
            for t in tests:
                s.delete(t)
            s.delete(cat)
        if (u := s.get(User, _FREE)):
            s.delete(u)
        s.commit()


@pytest.fixture
def seeded():
    _wipe()
    with Session(_test_engine) as s:
        s.add(User(id=_FREE, email=f"{_FREE}@example.com", name="free"))
        s.commit()
        cat_id, created = seed_mod.seed(s, DATA)
    assert created
    yield cat_id
    _wipe()


# ── Validator ─────────────────────────────────────────────────────────────────

def test_validator_accepts_data_file():
    seed_mod.validate(DATA)


def _broken(mutate):
    d = copy.deepcopy(DATA)
    mutate(d)
    with pytest.raises(ValueError):
        seed_mod.validate(d)


def test_validator_rejects_missing_not_stated():
    def m(d):
        for q in d["tests"][0]["questions"]:
            if q["correct_option"] == "c":
                q["correct_option"] = "a"
    _broken(m)


def test_validator_rejects_five_statements():
    _broken(lambda d: d["tests"][0]["questions"].pop())


def test_validator_rejects_fourth_option():
    _broken(lambda d: d["tests"][0]["questions"][0].update(correct_option="d"))
    _broken(lambda d: d["tests"][0]["questions"][0].update(option_d="Kita"))


def test_validator_rejects_unknown_format():
    _broken(lambda d: d.update(format="nope"))


# ── Seed ──────────────────────────────────────────────────────────────────────

def test_seed_inserts_once(seeded):
    with Session(_test_engine) as s:
        tests = s.exec(select(PracticeTest).where(PracticeTest.category_id == seeded)).all()
        assert len(tests) == 10 and all(t.status == "testing" for t in tests)
        qs = s.exec(select(PracticeQuestion).where(PracticeQuestion.test_id.in_([t.id for t in tests]))).all()
        assert len(qs) == 60
        cat_id, created = seed_mod.seed(s, DATA)
        assert cat_id == seeded and not created
        assert len(s.exec(select(PracticeTest).where(PracticeTest.category_id == seeded)).all()) == 10


def test_hidden_from_guest_and_free_user(client, seeded):
    for headers in ({}, FREE):
        ids = [c["id"] for c in client.get("/api/practice/categories", headers=headers).json()]
        assert seeded not in ids
    assert seeded in [c["id"] for c in client.get("/api/practice/categories", headers=ADMIN).json()]


def test_exam_has_three_options(client, seeded):
    with Session(_test_engine) as s:
        test_ids = [t.id for t in s.exec(select(PracticeTest).where(PracticeTest.category_id == seeded)).all()]
    for tid in test_ids:
        r = client.get(f"/api/practice/tests/{tid}/exam", headers=ADMIN)
        assert r.status_code == 200
        body = r.json()
        assert body["test"]["lesson_text_lt"]
        assert len(body["questions"]) == 6
        for q in body["questions"]:
            assert [q["option_a"], q["option_b"], q["option_c"], q["option_d"]] == ["Tiesa", "Netiesa", "Nepasakyta", ""]
            assert q["correct_option"] in ("a", "b", "c")
