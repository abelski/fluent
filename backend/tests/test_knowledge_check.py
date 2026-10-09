"""#62a — knowledge check + "Work on mistakes": composition, server grading, gating, gaps, recs.

Grammar generators are monkeypatched with deterministic fakes (the SQLite test DB has no
sentence/verb content); practice content is real rows, read through the real cache.
"""
import random
from datetime import datetime, timedelta

import pytest
from jose import jwt
from sqlmodel import Session, select

import knowledge_check_service as kc
import routers.grammar as grammar_router
from conftest import _test_engine
from models import (
    DailyStudySession, GrammarLessonResult, GrammarProgram, KnowledgeCheck, PracticeCategory,
    PracticeQuestion, PracticeTest, User, UserGrammarProgram, UserPracticeCategoryEnrollment,
)

_SECRET = "fluent-local-secret-change-in-prod"
_FREE, _PREMIUM = "kc62-free", "kc62-premium"
URL = "/api/me/knowledge-check"


def _auth(email: str) -> dict:
    return {"Authorization": "Bearer " + jwt.encode({"email": email, "name": "x", "picture": None}, _SECRET, algorithm="HS256")}


ADMIN = _auth("artyrbelski@gmail.com")
FREE = _auth(f"{_FREE}@example.com")
PREMIUM = _auth(f"{_PREMIUM}@example.com")

NOUN_IDS = [1, 4, 10, 16, 22, 28, 34]
NO_OPTIONS_ID = 40  # a published basic lesson whose tasks never carry options


def _fake_lessons(session, is_admin=False):
    return [{"id": i, "title": f"Lesson {i}", "level": "basic", "cases": [i]} for i in NOUN_IDS + [NO_OPTIONS_ID]] + [
        {"id": 2, "title": "Lesson 1", "level": "advanced", "cases": [1]},
    ]


def _fake_tasks(lid, session):
    if lid == NO_OPTIONS_ID:
        return [{"type": "sentence", "display": "x ___", "answer": "x"} for _ in range(6)]
    return [
        {"type": "sentence", "display": f"{lid}-{i} ___", "answer": f"a{lid}-{i}",
         "options": [f"a{lid}-{i}", "w1", "w2", "w3"]}
        for i in range(24)
    ]


_created: dict[str, list[int]] = {"cat": [], "test": [], "prog": []}
_ids: dict[str, int] = {}


def _wipe():
    with Session(_test_engine) as s:
        for model, col in ((PracticeQuestion, PracticeQuestion.test_id),):
            for row in s.exec(select(model).where(col.in_(_created["test"]))).all():
                s.delete(row)
        for row in s.exec(select(UserPracticeCategoryEnrollment).where(
                UserPracticeCategoryEnrollment.category_id.in_(_created["cat"]))).all():
            s.delete(row)
        for row in s.exec(select(UserGrammarProgram).where(
                UserGrammarProgram.program_id.in_(_created["prog"]))).all():
            s.delete(row)
        for tid in _created["test"]:
            if (t := s.get(PracticeTest, tid)):
                s.delete(t)
        for cid in _created["cat"]:
            if (c := s.get(PracticeCategory, cid)):
                s.delete(c)
        for pid in _created["prog"]:
            if (p := s.get(GrammarProgram, pid)):
                s.delete(p)
        for model in (KnowledgeCheck, GrammarLessonResult, DailyStudySession):
            for row in s.exec(select(model).where(model.user_id.in_([_FREE, _PREMIUM, "admin-test-id"]))).all():
                s.delete(row)
        for uid in (_FREE, _PREMIUM):
            if (u := s.get(User, uid)):
                s.delete(u)
        s.commit()
    for v in _created.values():
        v.clear()


def _add_test(s, cat_id, title, status="published", premium=False, n=3, passage="Tekstas *čia*."):
    t = PracticeTest(category_id=cat_id, title_ru=title, status=status, is_premium=premium,
                     lesson_text_lt=passage)
    s.add(t)
    s.commit()
    s.refresh(t)
    _created["test"].append(t.id)
    for i in range(n):
        s.add(PracticeQuestion(test_id=t.id, question_ru=f"{title}-q{i}", question_lt=f"{title}-lt{i}",
                               option_a="Teisingas", option_b="Neteisingas", option_c="", option_d="",
                               correct_option="a", sort_order=i))
    s.commit()
    return t


def _add_cat(s, name, cid=None):
    c = PracticeCategory(id=cid, name_ru=name, name_en=name + " EN", sort_order=9100)
    s.add(c)
    s.commit()
    s.refresh(c)
    _created["cat"].append(c.id)
    return c


@pytest.fixture(autouse=True)
def _data(monkeypatch):
    monkeypatch.setattr(kc, "get_lessons", _fake_lessons)
    monkeypatch.setattr(grammar_router, "get_lessons", _fake_lessons)
    monkeypatch.setattr(kc, "get_lesson_tasks", _fake_tasks)
    monkeypatch.setattr(kc, "get_verb_lesson_tasks", _fake_tasks)
    _wipe()
    with Session(_test_engine) as s:
        s.add(User(id=_FREE, email=f"{_FREE}@example.com", name="free"))
        s.add(User(id=_PREMIUM, email=f"{_PREMIUM}@example.com", name="prem", is_premium=True,
                   premium_until=datetime.utcnow() + timedelta(days=30)))
        s.commit()
        consti = s.get(PracticeCategory, 1) or _add_cat(s, "Конституция", cid=1)
        _add_test(s, consti.id, "CONSTI")
        reading = _add_cat(s, "Чтение")
        _ids["reading"] = reading.id
        _add_test(s, reading.id, "RPUB")
        _add_test(s, reading.id, "RPREM", premium=True)
        _add_test(s, reading.id, "RTEST", status="testing")
        hidden = _add_cat(s, "Hidden")
        _ids["hidden"] = hidden.id
        _add_test(s, hidden.id, "HTEST", status="testing")
        prog = GrammarProgram(title="KC cases", title_en="KC cases EN", is_public=True)
        s.add(prog)
        s.commit()
        s.refresh(prog)
        _created["prog"].append(prog.id)
        _ids["prog"] = prog.id
    yield
    _wipe()


def _build():
    with Session(_test_engine) as s:
        return kc.build_check(s)


def _practice_idx(tasks):
    return [i for i, t in enumerate(tasks) if t["topic"].startswith("p:")]


# ── Composition ───────────────────────────────────────────────────────────────

def test_composition():
    tasks = _build()
    assert len(tasks) == 16
    topics = [t["topic"] for t in tasks]
    g = {t for t in topics if t.startswith("g:")}
    v = {t for t in topics if t.startswith("v:")}
    p = {t for t in topics if t.startswith("p:")}
    assert len(g) == 5 and len(v) == 2 and p == {f"p:{_ids['reading']}"}
    assert all(topics.count(t) == 2 for t in set(topics))
    assert f"g:{NO_OPTIONS_ID}" not in g  # topic without MC tasks swapped out
    assert v <= {f"v:{i}" for i in kc.VERB_TOPIC_LESSON_IDS}
    for t in tasks:
        if t["topic"].startswith("p:"):
            assert t["type"] == "reading" and 2 <= len(t["options"]) <= 4
            assert t["question_ru"].startswith("RPUB-")  # never premium/testing/Конституция
            assert t["passage_lt"] == "Tekstas *čia*."
            assert t["options"] == ["Teisingas", "Neteisingas"] and t["answer"] == "Teisingas"
            assert t["instruction_ru"] and t["instruction_en"]
        else:
            assert len(t["options"]) == 4
    idx = _practice_idx(tasks)
    assert idx == list(range(idx[0], idx[0] + 2))  # contiguous block


def test_two_seeds_differ():
    random.seed(1)
    a = _build()
    random.seed(2)
    b = _build()
    assert [t["answer"] for t in a] != [t["answer"] for t in b]


def test_constitution_never_used():
    for _ in range(20):
        assert all(t["topic"] != "p:1" for t in _build())


def test_empty_practice_pool_gives_sixth_noun_topic():
    with Session(_test_engine) as s:
        t = s.exec(select(PracticeTest).where(PracticeTest.title_ru == "RPUB")).first()
        t.status = "testing"
        s.add(t)
        s.commit()
    tasks = _build()
    assert len(tasks) == 16
    assert not _practice_idx(tasks)
    assert len({t["topic"] for t in tasks if t["topic"].startswith("g:")}) == 6


def test_new_category_joins_pool_when_published():
    with Session(_test_engine) as s:
        for name in ("RPUB",):
            t = s.exec(select(PracticeTest).where(PracticeTest.title_ru == name)).first()
            t.status = "testing"
            s.add(t)
        s.commit()
        assert all(c.id != _ids["hidden"] for c in kc.practice_pool(s))
        h = s.exec(select(PracticeTest).where(PracticeTest.title_ru == "HTEST")).first()
        h.status = "published"
        s.add(h)
        s.commit()
    tasks = _build()
    assert {t["topic"] for t in tasks if t["topic"].startswith("p:")} == {f"p:{_ids['hidden']}"}


def test_practice_block_keeps_builder_order(monkeypatch):
    def ordered(exam, count):
        return [{"type": "reading", "passage_lt": "", "question_lt": "", "question_ru": f"turn{i}",
                 "options": ["a", "b"], "answer": "a"} for i in range(count)]
    monkeypatch.setitem(kc.PRACTICE_TASK_BUILDERS, "choice", ordered)
    for _ in range(10):
        tasks = _build()
        block = [tasks[i]["question_ru"] for i in _practice_idx(tasks)]
        assert block == ["turn0", "turn1"]


# ── Start / submit / gating ───────────────────────────────────────────────────

def test_requires_auth(client):
    assert client.get(URL).status_code == 401
    assert client.post(URL).status_code == 401
    assert client.post(f"{URL}/1/answers", json={"responses": []}).status_code == 401
    assert client.get(f"{URL}/gaps/tasks").status_code == 401


def test_start_strips_topic_and_reuses_open_check(client):
    r1 = client.post(URL, headers=FREE)
    assert r1.status_code == 200
    body = r1.json()
    assert len(body["tasks"]) == 16
    assert all("topic" not in t and "answer" in t for t in body["tasks"])
    r2 = client.post(URL, headers=FREE)
    assert r2.json()["id"] == body["id"]
    with Session(_test_engine) as s:
        assert len(s.exec(select(KnowledgeCheck).where(KnowledgeCheck.user_id == _FREE)).all()) == 1


def _answers(tasks, wrong_first=0):
    return [("WRONG" if i < wrong_first else t["answer"]) for i, t in enumerate(tasks)]


def test_server_grading_and_free_retake(client):
    body = client.post(URL, headers=FREE).json()
    tasks = body["tasks"]
    resp = _answers(tasks)
    resp[0] = "WRONG"
    r = client.post(f"{URL}/{body['id']}/answers", json={"responses": resp}, headers=FREE)
    assert r.status_code == 200
    res = r.json()
    assert res["total"] == 16 and res["correct"] == 15
    weak = [t for t in res["topics"] if t["weak"]]
    assert len(weak) == 1 and weak[0]["correct"] == 1 and weak[0]["total"] == 2
    assert all(t["title_ru"] and t["title_en"] for t in res["topics"])
    # submit twice
    assert client.post(f"{URL}/{body['id']}/answers", json={"responses": resp}, headers=FREE).status_code == 409
    # free retake
    r = client.post(URL, headers=FREE)
    assert r.status_code == 403 and r.json()["detail"]["code"] == "premium_required"
    state = client.get(URL, headers=FREE).json()
    assert state["is_premium"] is False and "recommendations" not in state
    assert state["latest"]["correct"] == 15
    # no quota, no lesson result
    with Session(_test_engine) as s:
        assert not s.exec(select(DailyStudySession).where(DailyStudySession.user_id == _FREE)).all()
        assert not s.exec(select(GrammarLessonResult).where(GrammarLessonResult.user_id == _FREE)).all()


def test_forged_response_lists_rejected(client):
    body = client.post(URL, headers=FREE).json()
    n = len(body["tasks"])
    for resp in (["x"] * (n + 1), ["x"] * (n - 1)):
        assert client.post(f"{URL}/{body['id']}/answers", json={"responses": resp}, headers=FREE).status_code == 422


def test_other_users_check_is_404(client):
    body = client.post(URL, headers=FREE).json()
    r = client.post(f"{URL}/{body['id']}/answers", json={"responses": [None] * 16}, headers=PREMIUM)
    assert r.status_code == 404


def _complete(client, headers, wrong_first=0):
    body = client.post(URL, headers=headers).json()
    return client.post(f"{URL}/{body['id']}/answers",
                       json={"responses": _answers(body["tasks"], wrong_first)}, headers=headers).json()


def test_premium_and_admin_can_retake(client):
    for h in (PREMIUM, ADMIN):
        _complete(client, h)
        assert client.post(URL, headers=h).status_code == 200


# ── Gaps ──────────────────────────────────────────────────────────────────────

def test_gaps_gating(client):
    assert client.get(f"{URL}/gaps/tasks", headers=FREE).status_code == 403
    r = client.get(f"{URL}/gaps/tasks", headers=PREMIUM)
    assert r.status_code == 404 and r.json()["detail"]["code"] == "no_check"
    _complete(client, PREMIUM)
    r = client.get(f"{URL}/gaps/tasks", headers=PREMIUM)
    assert r.status_code == 404 and r.json()["detail"]["code"] == "no_gaps"


def test_gaps_tasks_for_premium_without_enrollments(client):
    _complete(client, PREMIUM, wrong_first=16)  # everything wrong → all 8 topics weak
    r = client.get(f"{URL}/gaps/tasks", headers=PREMIUM)
    assert r.status_code == 200
    tasks = r.json()
    assert 0 < len(tasks) <= 10
    reading = [i for i, t in enumerate(tasks) if t["type"] == "reading"]
    if reading:
        assert reading == list(range(reading[0], reading[0] + len(reading)))


def test_gap_topics_weakest_first(monkeypatch):
    result = [
        {"topic": f"g:{i}", "title_ru": "", "title_en": "", "correct": c, "total": 2, "weak": c < 2}
        for i, c in zip(NOUN_IDS, [1, 0, 1, 0, 1, 0, 1])
    ]
    seen: list[str] = []
    monkeypatch.setattr(kc, "_grammar_tasks", lambda key, s: seen.append(key) or _fake_tasks(int(key[2:]), s))
    with Session(_test_engine) as s:
        tasks = kc.gap_tasks(result, s)
    assert seen == ["g:4", "g:16", "g:28", "g:1", "g:10"]
    assert len(tasks) == 10


def test_gaps_practice_block_contiguous():
    result = [
        {"topic": "g:1", "title_ru": "", "title_en": "", "correct": 0, "total": 2, "weak": True},
        {"topic": f"p:{_ids['reading']}", "title_ru": "", "title_en": "", "correct": 0, "total": 2, "weak": True},
    ]
    with Session(_test_engine) as s:
        for _ in range(10):
            tasks = kc.gap_tasks(result, s)
            idx = [i for i, t in enumerate(tasks) if t["type"] == "reading"]
            assert len(tasks) == 10 and len(idx) == 2 and idx[1] == idx[0] + 1


# ── Recommendations ───────────────────────────────────────────────────────────

def test_recommendations_for_premium(client):
    with Session(_test_engine) as s:
        s.add(UserPracticeCategoryEnrollment(user_id=_PREMIUM, category_id=_ids["reading"]))
        s.commit()
    _complete(client, PREMIUM, wrong_first=16)
    recs = client.get(URL, headers=PREMIUM).json()["recommendations"]
    prog = next(r for r in recs if r["kind"] == "grammar" and r["id"] == _ids["prog"])
    assert prog["enrolled"] is False and prog["title_en"] == "KC cases EN"
    assert len(prog["reasons"]) == 5  # every weak noun topic
    cat = next(r for r in recs if r["kind"] == "practice")
    assert cat["id"] == _ids["reading"] and cat["enrolled"] is True
    assert len([r for r in recs if (r["kind"], r["id"]) == ("grammar", _ids["prog"])]) == 1
    client.post(f"/api/me/grammar-programs/{_ids['prog']}", headers=PREMIUM)
    recs = client.get(URL, headers=PREMIUM).json()["recommendations"]
    assert next(r for r in recs if r["kind"] == "grammar" and r["id"] == _ids["prog"])["enrolled"] is True
