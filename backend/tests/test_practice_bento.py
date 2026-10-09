"""#55 — practice bento backend: anonymous read, section/is_final fields, server Premium."""
from datetime import datetime, timedelta

import pytest
from jose import jwt
from sqlmodel import Session, select

from conftest import _test_engine
from models import (
    PracticeCategory, PracticeExamResult, PracticeQuestion, PracticeTest, User,
    UserPracticeCategoryEnrollment,
)

_SECRET = "fluent-local-secret-change-in-prod"
_FREE, _PREMIUM = "pb55-free", "pb55-premium"


def _auth(email: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"email": email, "name": "x", "picture": None}, _SECRET, algorithm="HS256")}


ADMIN = _auth("artyrbelski@gmail.com")
FREE = _auth(f"{_FREE}@example.com")
PREMIUM = _auth(f"{_PREMIUM}@example.com")

_created: dict[str, list[int]] = {"cat": [], "test": []}


def _wipe():
    with Session(_test_engine) as s:
        test_ids = _created["test"]
        for model, col in ((PracticeQuestion, PracticeQuestion.test_id), (PracticeExamResult, PracticeExamResult.test_id)):
            for row in s.exec(select(model).where(col.in_(test_ids))).all():
                s.delete(row)
        for row in s.exec(select(UserPracticeCategoryEnrollment).where(
                UserPracticeCategoryEnrollment.category_id.in_(_created["cat"]))).all():
            s.delete(row)
        for tid in test_ids:
            if (t := s.get(PracticeTest, tid)):
                s.delete(t)
        for cid in _created["cat"]:
            if (c := s.get(PracticeCategory, cid)):
                s.delete(c)
        for uid in (_FREE, _PREMIUM):
            if (u := s.get(User, uid)):
                s.delete(u)
        s.commit()
    _created["cat"].clear()
    _created["test"].clear()


@pytest.fixture(autouse=True)
def _data():
    _wipe()
    with Session(_test_engine) as s:
        s.add(User(id=_FREE, email=f"{_FREE}@example.com", name="free"))
        s.add(User(id=_PREMIUM, email=f"{_PREMIUM}@example.com", name="prem", is_premium=True,
                   premium_until=datetime.utcnow() + timedelta(days=30)))
        cat = PracticeCategory(name_ru="Конституция 55", sort_order=9000)
        s.add(cat)
        s.commit()
        s.refresh(cat)
        _created["cat"].append(cat.id)
        tests = [
            PracticeTest(category_id=cat.id, title_ru="T1", status="published", sort_order=1,
                         section_ru="Блок 1", section_en="Block 1"),
            PracticeTest(category_id=cat.id, title_ru="T2", status="published", sort_order=2, section_ru="Блок 1"),
            PracticeTest(category_id=cat.id, title_ru="Draft", status="draft", sort_order=3),
            PracticeTest(category_id=cat.id, title_ru="Final", status="published", sort_order=4,
                         is_final=True, is_premium=True),
        ]
        for t in tests:
            s.add(t)
        s.commit()
        for t in tests:
            s.refresh(t)
            _created["test"].append(t.id)
            s.add(PracticeQuestion(test_id=t.id, question_ru="Q?", option_a="a", option_b="b",
                                   option_c="c", option_d="d", correct_option="a"))
        s.commit()
    yield
    _wipe()


def _cat_id() -> int:
    return _created["cat"][0]


def _tests(client, headers=None) -> list[dict]:
    r = client.get(f"/api/practice/categories/{_cat_id()}/tests", headers=headers or {})
    assert r.status_code == 200
    return r.json()


def test_anonymous_categories(client):
    r = client.get("/api/practice/categories")
    assert r.status_code == 200
    cat = next(c for c in r.json() if c["id"] == _cat_id())
    assert cat["test_count"] == 3  # draft not counted
    assert cat["enrolled"] is False


def test_anonymous_tests_published_unlocked_no_scores(client):
    tests = _tests(client)
    assert [t["title_ru"] for t in tests] == ["T1", "T2", "Final"]
    assert all(t["is_locked"] is False and t["best_score_pct"] is None for t in tests)


def test_invalid_token_is_treated_as_anonymous(client):
    tests = _tests(client, {"Authorization": "Bearer garbage"})
    assert all(t["is_locked"] is False for t in tests)


def test_authenticated_lock_rule_unchanged(client):
    client.post(f"/api/me/practice-categories/{_cat_id()}", headers=FREE)
    assert next(c for c in client.get("/api/practice/categories", headers=FREE).json()
                if c["id"] == _cat_id())["enrolled"] is True
    tests = _tests(client, FREE)
    assert [t["is_locked"] for t in tests] == [False, True, True]
    with Session(_test_engine) as s:
        s.add(PracticeExamResult(user_id=_FREE, test_id=_created["test"][0], score=9, total=10))
        s.commit()
    tests = _tests(client, FREE)
    assert [t["is_locked"] for t in tests] == [False, False, True]
    assert tests[0]["best_score_pct"] == 0.9


def test_section_and_final_returned(client):
    t1, t2, final = _tests(client)
    assert (t1["section_ru"], t1["section_en"], t1["is_final"]) == ("Блок 1", "Block 1", False)
    assert (t2["section_ru"], t2["section_en"]) == ("Блок 1", None)
    assert final["is_final"] is True and final["section_ru"] is None
    admin = [t for t in client.get(f"/api/admin/practice/categories/{_cat_id()}/tests", headers=ADMIN).json()]
    assert admin[0]["section_ru"] == "Блок 1" and admin[3]["is_final"] is True
    all_admin = {t["id"]: t for t in client.get("/api/admin/practice/tests", headers=ADMIN).json()}
    assert all_admin[_created["test"][0]]["section_en"] == "Block 1"


def _db_test(tid: int) -> PracticeTest:
    with Session(_test_engine) as s:
        return s.get(PracticeTest, tid)


def test_admin_patch_sets_and_clears_section(client):
    tid = _created["test"][1]
    r = client.patch(f"/api/admin/practice/tests/{tid}", headers=ADMIN,
                     json={"section_ru": "  Блок 2 ", "section_en": "Block 2", "is_final": True})
    assert r.status_code == 200
    t = _db_test(tid)
    assert (t.section_ru, t.section_en, t.is_final) == ("Блок 2", "Block 2", True)

    # PATCH without the section fields keeps them.
    client.patch(f"/api/admin/practice/tests/{tid}", headers=ADMIN, json={"title_ru": "T2 new"})
    t = _db_test(tid)
    assert (t.title_ru, t.section_ru, t.section_en, t.is_final) == ("T2 new", "Блок 2", "Block 2", True)

    # Empty string / null clears.
    client.patch(f"/api/admin/practice/tests/{tid}", headers=ADMIN,
                 json={"section_ru": "", "section_en": None, "is_final": False})
    t = _db_test(tid)
    assert (t.section_ru, t.section_en, t.is_final) == (None, None, False)


def test_admin_section_too_long_422(client):
    tid = _created["test"][0]
    r = client.patch(f"/api/admin/practice/tests/{tid}", headers=ADMIN, json={"section_ru": "x" * 121})
    assert r.status_code == 422
    assert _db_test(tid).section_ru == "Блок 1"
    ok = client.patch(f"/api/admin/practice/tests/{tid}", headers=ADMIN, json={"section_ru": "x" * 120})
    assert ok.status_code == 200


def test_admin_create_with_section_and_final(client):
    r = client.post("/api/admin/practice/tests", headers=ADMIN, json={
        "title_ru": "Новый", "category_id": _cat_id(), "section_ru": " Итоговые ", "is_final": True})
    assert r.status_code == 200
    _created["test"].append(r.json()["id"])
    t = _db_test(r.json()["id"])
    assert (t.section_ru, t.section_en, t.is_final) == ("Итоговые", None, True)
    assert client.post("/api/admin/practice/tests", headers=ADMIN, json={
        "title_ru": "Длинный", "section_en": "y" * 121}).status_code == 422


def _final_id() -> int:
    return _created["test"][3]


def test_exam_premium_test_403_for_free_user(client):
    r = client.get(f"/api/practice/tests/{_final_id()}/exam", headers=FREE)
    assert r.status_code == 403
    body = r.json()
    assert body["detail"] == {"code": "premium_required"}
    assert "questions" not in body


def test_exam_premium_test_ok_for_premium_and_admin(client):
    for headers in (PREMIUM, ADMIN):
        r = client.get(f"/api/practice/tests/{_final_id()}/exam", headers=headers)
        assert r.status_code == 200
        assert len(r.json()["questions"]) == 1


def test_exam_expired_premium_is_free(client):
    with Session(_test_engine) as s:
        u = s.get(User, _PREMIUM)
        u.premium_until = datetime.utcnow() - timedelta(days=1)
        s.add(u)
        s.commit()
    assert client.get(f"/api/practice/tests/{_final_id()}/exam", headers=PREMIUM).status_code == 403


def test_exam_free_test_ok_for_free_user_and_still_auth_only(client):
    tid = _created["test"][0]
    assert client.get(f"/api/practice/tests/{tid}/exam", headers=FREE).status_code == 200
    assert client.get(f"/api/practice/tests/{tid}/exam").status_code == 401
    assert client.get("/api/me/practice-categories").status_code == 401


# ── #62a — empty categories are hidden from non-admins ───────────────────────

def _testing_only_category() -> int:
    with Session(_test_engine) as s:
        cat = PracticeCategory(name_ru="Скрытая 62a", sort_order=9001)
        s.add(cat)
        s.commit()
        s.refresh(cat)
        _created["cat"].append(cat.id)
        t = PracticeTest(category_id=cat.id, title_ru="Hidden", status="testing")
        s.add(t)
        s.commit()
        s.refresh(t)
        _created["test"].append(t.id)
        for uid in (_FREE,):
            s.add(UserPracticeCategoryEnrollment(user_id=uid, category_id=cat.id))
        s.add(UserPracticeCategoryEnrollment(user_id="admin-test-id", category_id=cat.id))
        s.commit()
        return cat.id


def _ids(client, url, headers=None) -> set[int]:
    r = client.get(url, headers=headers or {})
    assert r.status_code == 200
    return {c["id"] for c in r.json()}


def test_testing_only_category_hidden_from_guest_and_free(client):
    hidden = _testing_only_category()
    assert hidden not in _ids(client, "/api/practice/categories")
    assert hidden not in _ids(client, "/api/practice/categories", FREE)
    assert hidden not in _ids(client, "/api/me/practice-categories", FREE)


def test_testing_only_category_shown_to_admin(client):
    hidden = _testing_only_category()
    assert hidden in _ids(client, "/api/practice/categories", ADMIN)
    assert hidden in _ids(client, "/api/me/practice-categories", ADMIN)


def test_category_with_a_published_test_visible_to_everyone(client):
    client.post(f"/api/me/practice-categories/{_cat_id()}", headers=FREE)
    assert _cat_id() in _ids(client, "/api/practice/categories")
    assert _cat_id() in _ids(client, "/api/practice/categories", FREE)
    assert _cat_id() in _ids(client, "/api/me/practice-categories", FREE)
