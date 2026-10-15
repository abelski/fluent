"""#66 — overview pages: `last_result_at` per grammar program / practice category, and
the practice `title_lt` field (admin create/update/import validation, test list)."""
import io
import json
from datetime import datetime, timedelta

import pytest
from jose import jwt
from sqlmodel import Session, select

from conftest import _test_engine
from models import (
    GrammarCaseRule, GrammarLessonResult, GrammarProgram, PracticeCategory, PracticeExamResult,
    PracticeTest, User, UserGrammarProgram, UserPracticeCategoryEnrollment,
)

_SECRET = "fluent-local-secret-change-in-prod"
_UID = "ov66-user"
_EMAIL = f"{_UID}@example.com"
_G_ALL, _G_PLURAL, _G_OTHER = 9661, 9662, 9663


def _auth(email: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"email": email, "name": "x", "picture": None}, _SECRET, algorithm="HS256")}


USER = _auth(_EMAIL)
ADMIN = _auth("artyrbelski@gmail.com")
_created: dict[str, list[int]] = {"cat": [], "test": []}


def _wipe():
    with Session(_test_engine) as s:
        for model, col in ((GrammarLessonResult, GrammarLessonResult.user_id),
                           (UserGrammarProgram, UserGrammarProgram.user_id),
                           (PracticeExamResult, PracticeExamResult.user_id),
                           (UserPracticeCategoryEnrollment, UserPracticeCategoryEnrollment.user_id)):
            for row in s.exec(select(model).where(col == _UID)).all():
                s.delete(row)
        for tid in _created["test"]:
            if (t := s.get(PracticeTest, tid)):
                s.delete(t)
        for cid in _created["cat"]:
            if (c := s.get(PracticeCategory, cid)):
                s.delete(c)
        if (u := s.get(User, _UID)):
            s.delete(u)
        s.commit()
    _created["cat"].clear()
    _created["test"].clear()


@pytest.fixture(autouse=True)
def _data():
    _wipe()
    with Session(_test_engine) as s:
        s.add(User(id=_UID, email=_EMAIL, name="ov"))
        # Lessons 1-3 cover case 4 (singular) — publish it so they're visible.
        rule = s.exec(select(GrammarCaseRule).where(GrammarCaseRule.case_index == 4)).first()
        if rule:
            rule.status = "published"
            s.add(rule)
        else:
            s.add(GrammarCaseRule(case_index=4, name_ru="Галининкас", question="?", usage="t",
                                  endings_sg="-ą", endings_pl="-us", transform="t", status="published"))
        for pid, flt in ((_G_ALL, None), (_G_PLURAL, '["Daugiskaita"]'), (_G_OTHER, None)):
            if not s.get(GrammarProgram, pid):
                s.add(GrammarProgram(id=pid, title=f"ov66 {pid}", is_public=True, lesson_filter=flt))
        s.commit()
    yield
    _wipe()


def _grammar_result(lesson_id: int, when: datetime) -> None:
    with Session(_test_engine) as s:
        s.add(GrammarLessonResult(user_id=_UID, lesson_id=lesson_id, score=9, total=10, passed=True, created_at=when))
        s.commit()


def _enroll_grammar(*pids: int) -> None:
    with Session(_test_engine) as s:
        for pid in pids:
            s.add(UserGrammarProgram(user_id=_UID, program_id=pid))
        s.commit()


def _programs(client, headers=None) -> dict[int, dict]:
    r = client.get("/api/grammar-programs", headers=headers or {})
    assert r.status_code == 200
    return {p["id"]: p for p in r.json()}


# ── Grammar ──────────────────────────────────────────────────────────────────

def test_grammar_last_result_is_the_latest_result_in_the_program(client):
    _enroll_grammar(_G_ALL, _G_PLURAL)
    old, new = datetime(2026, 10, 1, 9, 0), datetime(2026, 10, 5, 18, 30)
    _grammar_result(1, old)
    _grammar_result(2, new)

    progs = _programs(client, USER)
    assert progs[_G_ALL]["last_result_at"] == "2026-10-05T18:30:00Z"
    # Lessons 1-2 are singular — the plural-only program has no result of its own.
    assert progs[_G_PLURAL]["last_result_at"] is None
    # Not enrolled → null even though it would contain the lessons.
    assert progs[_G_OTHER]["last_result_at"] is None


def test_grammar_last_result_excludes_the_remind_sentinel(client):
    _enroll_grammar(_G_ALL)
    _grammar_result(1, datetime(2026, 10, 1, 9, 0))
    _grammar_result(0, datetime(2026, 10, 9, 9, 0))  # remind run — can't be attributed to a program
    assert _programs(client, USER)[_G_ALL]["last_result_at"] == "2026-10-01T09:00:00Z"


def test_grammar_last_result_null_without_results_and_for_guests(client):
    _enroll_grammar(_G_ALL)
    assert _programs(client, USER)[_G_ALL]["last_result_at"] is None
    assert _programs(client)[_G_ALL]["last_result_at"] is None


# ── Practice ─────────────────────────────────────────────────────────────────

def _practice_category(enroll: bool = True) -> tuple[int, list[int]]:
    with Session(_test_engine) as s:
        cat = PracticeCategory(name_ru="ov66 cat", sort_order=9660)
        s.add(cat)
        s.commit()
        s.refresh(cat)
        _created["cat"].append(cat.id)
        tests = [PracticeTest(category_id=cat.id, title_ru=f"T{i}", title_lt=f"Testas {i}",
                              status="published", sort_order=i) for i in (1, 2)]
        for t in tests:
            s.add(t)
        if enroll:
            s.add(UserPracticeCategoryEnrollment(user_id=_UID, category_id=cat.id))
        s.commit()
        ids = []
        for t in tests:
            s.refresh(t)
            ids.append(t.id)
        _created["test"].extend(ids)
        return cat.id, ids


def _practice_result(test_id: int, when: datetime) -> None:
    with Session(_test_engine) as s:
        s.add(PracticeExamResult(user_id=_UID, test_id=test_id, score=5, total=10, created_at=when))
        s.commit()


def _my_categories(client) -> dict[int, dict]:
    r = client.get("/api/me/practice-categories", headers=USER)
    assert r.status_code == 200
    return {c["id"]: c for c in r.json()}


def test_practice_last_result_is_the_latest_result_in_the_category(client):
    cat_id, (t1, t2) = _practice_category()
    _practice_result(t2, datetime(2026, 10, 2, 12, 0))
    _practice_result(t1, datetime(2026, 10, 7, 8, 15))
    _practice_result(t1, datetime(2026, 10, 3, 8, 15))
    assert _my_categories(client)[cat_id]["last_result_at"] == "2026-10-07T08:15:00Z"


def test_practice_last_result_null_without_results(client):
    cat_id, _ = _practice_category()
    assert _my_categories(client)[cat_id]["last_result_at"] is None


def test_practice_test_list_returns_title_lt(client):
    cat_id, (t1, _) = _practice_category()
    rows = client.get(f"/api/practice/categories/{cat_id}/tests", headers=USER).json()
    assert {r["id"]: r["title_lt"] for r in rows}[t1] == "Testas 1"


# ── title_lt admin validation (server-side) ──────────────────────────────────

def test_admin_title_lt_is_stripped_cleared_and_length_checked(client):
    cat_id, (t1, _) = _practice_category(enroll=False)
    assert client.patch(f"/api/admin/practice/tests/{t1}", json={"title_lt": "  Čia mano šeima  "}, headers=ADMIN).status_code == 200
    with Session(_test_engine) as s:
        assert s.get(PracticeTest, t1).title_lt == "Čia mano šeima"
    # Not sent → untouched; "" → cleared.
    assert client.patch(f"/api/admin/practice/tests/{t1}", json={"title_ru": "T1b"}, headers=ADMIN).status_code == 200
    with Session(_test_engine) as s:
        assert s.get(PracticeTest, t1).title_lt == "Čia mano šeima"
    assert client.patch(f"/api/admin/practice/tests/{t1}", json={"title_lt": ""}, headers=ADMIN).status_code == 200
    with Session(_test_engine) as s:
        assert s.get(PracticeTest, t1).title_lt is None
    # Too long → 422 on update and create.
    assert client.patch(f"/api/admin/practice/tests/{t1}", json={"title_lt": "x" * 201}, headers=ADMIN).status_code == 422
    r = client.post("/api/admin/practice/tests", json={"title_ru": "New", "title_lt": "y" * 201, "category_id": cat_id}, headers=ADMIN)
    assert r.status_code == 422


def test_admin_export_import_carries_title_lt(client):
    _, (t1, _) = _practice_category(enroll=False)
    client.patch(f"/api/admin/practice/tests/{t1}", json={"title_lt": "Baigiamasis egzaminas"}, headers=ADMIN)
    exported = client.get(f"/api/admin/practice/tests/{t1}/export", headers=ADMIN).json()
    assert exported["title_lt"] == "Baigiamasis egzaminas"

    r = client.post("/api/admin/practice/tests/import", headers=ADMIN,
                    files={"file": ("t.json", io.BytesIO(json.dumps(exported).encode()), "application/json")})
    assert r.status_code == 200
    new_id = r.json()["test_id"]
    _created["test"].append(new_id)
    with Session(_test_engine) as s:
        assert s.get(PracticeTest, new_id).title_lt == "Baigiamasis egzaminas"

    exported["title_lt"] = "z" * 201
    r = client.post("/api/admin/practice/tests/import", headers=ADMIN,
                    files={"file": ("t.json", io.BytesIO(json.dumps(exported).encode()), "application/json")})
    assert r.status_code == 400
