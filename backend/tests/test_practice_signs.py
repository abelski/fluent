"""#62e — Signs and notices: validator, seed with images, image_url rules on the admin API."""
import copy
import importlib.util
import io
import json
import shutil
from pathlib import Path

import pytest
from jose import jwt
from sqlmodel import Session, select

from conftest import _test_engine
from models import PracticeCategory, PracticeQuestion, PracticeTest

_BACKEND = Path(__file__).resolve().parent.parent
_PUBLIC = _BACKEND.parent / "frontend" / "public"
_spec = importlib.util.spec_from_file_location("seed_practice_category", _BACKEND / "scripts" / "seed_practice_category.py")
seed_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(seed_mod)

DATA = json.loads((_BACKEND / "data" / "practice" / "signs.json").read_text(encoding="utf-8"))
_SECRET = "fluent-local-secret-change-in-prod"
ADMIN = {"Authorization": "Bearer " + jwt.encode({"email": "artyrbelski@gmail.com", "name": "x", "picture": None}, _SECRET, algorithm="HS256")}
BAD_URL = "https://x.com/a.png"


def _wipe(name_ru=DATA["category"]["name_ru"], extra_tests=()):
    with Session(_test_engine) as s:
        tids = list(extra_tests)
        cat = s.exec(select(PracticeCategory).where(PracticeCategory.name_ru == name_ru)).first()
        if cat:
            tids += [t.id for t in s.exec(select(PracticeTest).where(PracticeTest.category_id == cat.id)).all()]
        for q in s.exec(select(PracticeQuestion).where(PracticeQuestion.test_id.in_(tids))).all():
            s.delete(q)
        for tid in tids:
            if (t := s.get(PracticeTest, tid)):
                s.delete(t)
        if cat:
            s.delete(cat)
        s.commit()


@pytest.fixture
def seeded():
    _wipe()
    with Session(_test_engine) as s:
        cat_id, created = seed_mod.seed(s, DATA)
    assert created
    yield cat_id
    _wipe()


# ── Validator ─────────────────────────────────────────────────────────────────

def test_validator_accepts_data_file_and_images():
    seed_mod.validate(DATA)
    tests = DATA["tests"]
    assert [len(t["questions"]) for t in tests] == [6, 6, 5, 6, 6]


def _bad(mutate, public_dir=None):
    d = copy.deepcopy(DATA)
    mutate(d["tests"][0]["questions"][0])
    with pytest.raises(ValueError):
        seed_mod.validate_signs(d, **({"public_dir": public_dir} if public_dir else {}))


def test_validator_rejects_external_url():
    _bad(lambda q: q.update(image_url=BAD_URL))


def test_validator_rejects_missing_file():
    _bad(lambda q: q.update(image_url="/img/signs/nope.webp"))


def test_validator_rejects_big_or_exif_image(tmp_path):
    (tmp_path / "img" / "signs").mkdir(parents=True)
    for f in _PUBLIC.joinpath("img", "signs").iterdir():
        shutil.copy(f, tmp_path / "img" / "signs" / f.name)
    seed_mod.validate_signs(DATA, public_dir=str(tmp_path))  # the copy itself is valid
    target = tmp_path / "img" / "signs" / "a13.webp"
    target.write_bytes(b"RIFF" + b"\0" * (201 * 1024))
    _bad(lambda q: None, public_dir=str(tmp_path))
    target.write_bytes(b"RIFF\0\0\0\0WEBPVP8X" + b"\0" * 20 + b"EXIF" + b"\0" * 100)
    _bad(lambda q: None, public_dir=str(tmp_path))


def test_validator_rejects_credited_photo_without_credit_or_source():
    _bad(lambda q: q.pop("image_credit"))
    _bad(lambda q: q.pop("source_url"))


def test_validator_rejects_prefixed_credit():
    _bad(lambda q: q.update(image_credit="Фото: X, CC BY 2.0"))


def test_validator_rejects_duplicate_or_bad_options():
    _bad(lambda q: q.update(options=["A", "A", "B", "C"]))
    _bad(lambda q: q.update(options=["A", "B"]))
    _bad(lambda q: q.update(options=["A", "B", "C"], correct_option="d"))


def test_validator_rejects_duplicate_image_url():
    import copy
    data = copy.deepcopy(DATA)
    data["tests"][1]["questions"][0]["image_url"] = data["tests"][0]["questions"][0]["image_url"]
    with pytest.raises(ValueError, match="unique"):
        seed_mod.validate(data)


# ── Seed + exam ───────────────────────────────────────────────────────────────

def test_seed_stores_own_options_images_no_passage(client, seeded):
    with Session(_test_engine) as s:
        tests = s.exec(select(PracticeTest).where(PracticeTest.category_id == seeded).order_by(PracticeTest.sort_order)).all()
        assert [t.question_count for t in tests] == [6, 6, 5, 6, 6]
        assert all(t.lesson_text_lt is None and t.kind == "choice" and t.status == "testing" for t in tests)
        q = s.exec(select(PracticeQuestion).where(PracticeQuestion.test_id == tests[0].id).order_by(PracticeQuestion.sort_order)).first()
        src = DATA["tests"][0]["questions"][0]
        assert [q.option_a, q.option_b, q.option_c, q.option_d] == src["options"]
        assert (q.image_url, q.image_credit) == (src["image_url"], src["image_credit"])
        tid = tests[0].id
    r = client.get(f"/api/practice/tests/{tid}/exam", headers=ADMIN)
    assert r.status_code == 200
    qs = r.json()["questions"]
    assert len(qs) == 6 and all(q["image_url"].startswith("/img/signs/") for q in qs)
    assert any(q["image_credit"] for q in qs)


def test_update_text_rewrites_in_place(seeded):
    import copy
    data = copy.deepcopy(DATA)
    src = data["tests"][0]["questions"][0]
    src.update(question_lt="NAUJAS?", options=["x", "y", "z"], correct_option="b")
    with Session(_test_engine) as s:
        before = s.exec(select(PracticeQuestion).where(PracticeQuestion.image_url == src["image_url"])).one().id
        assert seed_mod.update_text(s, data) == 29
    with Session(_test_engine) as s:
        q = s.exec(select(PracticeQuestion).where(PracticeQuestion.image_url == src["image_url"])).one()
        assert q.id == before
        assert (q.question_lt, q.question_ru, q.option_c, q.option_d, q.correct_option) == ("NAUJAS?", "NAUJAS?", "z", "", "b")


# ── Admin API ─────────────────────────────────────────────────────────────────

@pytest.fixture
def admin_test(client):
    _wipe(extra_tests=())
    r = client.post("/api/admin/practice/tests", headers=ADMIN, json={"title_ru": "SIGNS-API", "question_count": 1})
    assert r.status_code == 200, r.text
    tid = r.json()["id"]
    created = [tid]
    yield tid, created
    _wipe(name_ru="__none__", extra_tests=created)


_Q = {"question_ru": "Q", "option_a": "a", "option_b": "b", "option_c": "c", "option_d": "d", "correct_option": "a"}


def test_create_update_validate_and_clear(client, admin_test):
    tid, _ = admin_test
    assert client.post(f"/api/admin/practice/tests/{tid}/questions", headers=ADMIN, json={**_Q, "image_url": BAD_URL}).status_code == 400
    r = client.post(f"/api/admin/practice/tests/{tid}/questions", headers=ADMIN,
                    json={**_Q, "image_url": "/img/signs/a13.webp", "image_credit": "Фото: X, CC0"})
    assert r.status_code == 200
    qid = r.json()["id"]
    assert client.patch(f"/api/admin/practice/questions/{qid}", headers=ADMIN, json={"image_url": BAD_URL}).status_code == 400
    # an unrelated update leaves the image alone
    assert client.patch(f"/api/admin/practice/questions/{qid}", headers=ADMIN, json={"question_ru": "Q2"}).status_code == 200
    row = client.get(f"/api/admin/practice/tests/{tid}/questions", headers=ADMIN).json()[0]
    assert (row["image_url"], row["image_credit"]) == ("/img/signs/a13.webp", "Фото: X, CC0")
    assert client.patch(f"/api/admin/practice/questions/{qid}", headers=ADMIN, json={"image_url": "", "image_credit": ""}).status_code == 200
    row = client.get(f"/api/admin/practice/tests/{tid}/questions", headers=ADMIN).json()[0]
    assert (row["image_url"], row["image_credit"]) == (None, None)


def test_export_import_round_trip_and_bad_import(client, admin_test):
    tid, created = admin_test
    client.post(f"/api/admin/practice/tests/{tid}/questions", headers=ADMIN,
                json={**_Q, "image_url": "/img/signs/b1867.webp", "image_credit": "Фото: smaedli, CC BY 2.0"})
    payload = client.get(f"/api/admin/practice/tests/{tid}/export", headers=ADMIN).json()
    assert payload["questions"][0]["image_url"] == "/img/signs/b1867.webp"

    def _import(p):
        return client.post("/api/admin/practice/tests/import", headers=ADMIN,
                           files={"file": ("t.json", io.BytesIO(json.dumps(p).encode()), "application/json")})

    r = _import(payload)
    assert r.status_code == 200
    created.append(r.json()["test_id"])
    q = client.get(f"/api/admin/practice/tests/{created[-1]}/questions", headers=ADMIN).json()[0]
    assert (q["image_url"], q["image_credit"]) == ("/img/signs/b1867.webp", "Фото: smaedli, CC BY 2.0")

    bad = copy.deepcopy(payload)
    bad["title_ru"] = "SIGNS-BAD-IMPORT"
    bad["questions"][0]["image_url"] = BAD_URL
    assert _import(bad).status_code == 400
    with Session(_test_engine) as s:
        assert not s.exec(select(PracticeTest).where(PracticeTest.title_ru == "SIGNS-BAD-IMPORT")).first()
