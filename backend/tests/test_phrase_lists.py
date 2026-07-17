# Autotests for user-created phrase lists ("Мои списки").
# Covers entitlement gating, CRUD, bulk paste, study session, SM-2 progress,
# ownership isolation, and cascade deletes.

from jose import jwt
from sqlmodel import Session, select

import database
from models import User, CustomPhrase, CustomPhraseList, UserCustomPhraseProgress

JWT_SECRET = "fluent-local-secret-change-in-prod"
JWT_ALGORITHM = "HS256"
SUPERADMIN_EMAIL = "artyrbelski@gmail.com"


def make_token(email: str, name: str = "Test User") -> str:
    return jwt.encode({"email": email, "name": name, "picture": None}, JWT_SECRET, algorithm=JWT_ALGORITHM)


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _make_premium(client, email: str, lang: str = "ru") -> str:
    """Ensure the user exists (via /me/quota) then flag them premium. Returns user_id."""
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))
    with Session(database.engine) as s:
        user = s.exec(select(User).where(User.email == email)).first()
        user.is_premium = True
        user.premium_until = None  # None = no expiry
        user.lang = lang
        s.add(user)
        s.commit()
        return user.id


# ── Entitlement ───────────────────────────────────────────────────────────────

def test_unauthenticated_create_401(client):
    r = client.post("/api/me/phrase-lists", json={"title": "X", "difficulty": 1})
    assert r.status_code == 401


def test_non_premium_cannot_create(client):
    token = make_token("plain_pl@example.com")
    client.get("/api/me/quota", headers=auth(token))
    r = client.post("/api/me/phrase-lists", json={"title": "My list", "difficulty": 1}, headers=auth(token))
    assert r.status_code == 403


def test_admin_can_create(client):
    token = make_token(SUPERADMIN_EMAIL, name="Artur")
    r = client.post("/api/me/phrase-lists", json={"title": "Admin list", "difficulty": 1}, headers=auth(token))
    assert r.status_code == 200
    assert "id" in r.json()


def test_premium_can_create_and_list(client):
    email = "prem_create@example.com"
    _make_premium(client, email)
    token = make_token(email)
    r = client.post("/api/me/phrase-lists", json={"title": "Travel", "difficulty": 2}, headers=auth(token))
    assert r.status_code == 200
    list_id = r.json()["id"]

    lists = client.get("/api/me/phrase-lists", headers=auth(token)).json()
    assert any(l["id"] == list_id and l["title"] == "Travel" for l in lists)


def test_empty_title_422(client):
    email = "prem_empty@example.com"
    _make_premium(client, email)
    token = make_token(email)
    r = client.post("/api/me/phrase-lists", json={"title": "   ", "difficulty": 1}, headers=auth(token))
    assert r.status_code == 422


# ── Phrase add + bulk ─────────────────────────────────────────────────────────

def _create_list(client, token, title="List") -> int:
    return client.post("/api/me/phrase-lists", json={"title": title, "difficulty": 1}, headers=auth(token)).json()["id"]


def test_add_single_phrase(client):
    email = "prem_add@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    r = client.post(f"/api/me/phrase-lists/{lid}/phrases", json={"text": "Labas", "translation": "Привет"}, headers=auth(token))
    assert r.status_code == 200
    detail = client.get(f"/api/me/phrase-lists/{lid}", headers=auth(token)).json()
    assert len(detail["phrases"]) == 1
    assert detail["phrases"][0]["text"] == "Labas"


def test_bulk_add_skips_malformed(client):
    email = "prem_bulk@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    raw = "Labas rytas = Доброе утро\n\nrandomlinewithoutseparator\nAčiū = Спасибо\n  =  \nIki = Пока"
    r = client.post(f"/api/me/phrase-lists/{lid}/phrases/bulk", json={"text": raw}, headers=auth(token))
    assert r.status_code == 200
    assert r.json()["added"] == 3
    detail = client.get(f"/api/me/phrase-lists/{lid}", headers=auth(token)).json()
    assert len(detail["phrases"]) == 3


def test_bulk_no_valid_lines_422(client):
    email = "prem_bulk_bad@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    r = client.post(f"/api/me/phrase-lists/{lid}/phrases/bulk", json={"text": "no separators here\njust text"}, headers=auth(token))
    assert r.status_code == 422


def _revoke_premium(email: str) -> None:
    with Session(database.engine) as s:
        user = s.exec(select(User).where(User.email == email)).first()
        user.is_premium = False
        user.premium_until = None
        s.add(user)
        s.commit()


# ── Premium lost: lists stay visible but study/review is locked ───────────────

def test_lapsed_premium_cannot_study_but_can_view_and_delete(client):
    email = "lapsed_prem@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/phrase-lists/{lid}/phrases/bulk", json={"text": "a = б\nc = д"}, headers=auth(token))
    study = client.get(f"/api/me/phrase-lists/{lid}/study", headers=auth(token)).json()
    pid = study["phrases"][0]["id"]

    _revoke_premium(email)

    # Studying and recording progress are locked
    assert client.get(f"/api/me/phrase-lists/{lid}/study", headers=auth(token)).status_code == 403
    assert client.post(f"/api/me/phrase-lists/phrases/{pid}/progress",
                       json={"quality": 5, "stage_completed": 0}, headers=auth(token)).status_code == 403
    # Editing is locked too
    assert client.post(f"/api/me/phrase-lists/{lid}/phrases", json={"text": "x", "translation": "y"}, headers=auth(token)).status_code == 403

    # But the list stays visible…
    lists = client.get("/api/me/phrase-lists", headers=auth(token)).json()
    assert any(l["id"] == lid for l in lists)
    assert client.get(f"/api/me/phrase-lists/{lid}", headers=auth(token)).status_code == 200
    # …and can still be deleted
    assert client.delete(f"/api/me/phrase-lists/{lid}", headers=auth(token)).status_code == 200


# ── Language-aware translation storage ────────────────────────────────────────

def test_ru_user_translation_stored_russian_only(client):
    email = "prem_ru_lang@example.com"
    _make_premium(client, email, lang="ru")
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/phrase-lists/{lid}/phrases", json={"text": "Labas", "translation": "Привет"}, headers=auth(token))
    detail = client.get(f"/api/me/phrase-lists/{lid}", headers=auth(token)).json()
    p = detail["phrases"][0]
    assert p["translation"] == "Привет"
    assert p["translation_en"] is None  # RU owner: no English translation


def test_en_user_translation_stored_in_english_field(client):
    email = "prem_en_lang@example.com"
    _make_premium(client, email, lang="en")
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/phrase-lists/{lid}/phrases", json={"text": "Labas", "translation": "Hello"}, headers=auth(token))
    detail = client.get(f"/api/me/phrase-lists/{lid}", headers=auth(token)).json()
    p = detail["phrases"][0]
    # EN owner: text lands in translation_en (native English study) and translation (fallback)
    assert p["translation_en"] == "Hello"
    assert p["translation"] == "Hello"


# ── Ownership isolation ───────────────────────────────────────────────────────

def test_non_owner_gets_404(client):
    owner_email = "owner_pl@example.com"
    _make_premium(client, owner_email)
    owner_token = make_token(owner_email)
    lid = _create_list(client, owner_token, title="Private")

    other_email = "other_pl@example.com"
    _make_premium(client, other_email)
    other_token = make_token(other_email)
    r = client.get(f"/api/me/phrase-lists/{lid}", headers=auth(other_token))
    assert r.status_code == 404

    # Other user's list index must not include it
    other_lists = client.get("/api/me/phrase-lists", headers=auth(other_token)).json()
    assert all(l["id"] != lid for l in other_lists)


# ── Study + progress ──────────────────────────────────────────────────────────

def test_study_and_record_progress(client):
    email = "prem_study@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/phrase-lists/{lid}/phrases/bulk",
                json={"text": "Labas rytas = Доброе утро\nAčiū labai = Большое спасибо"}, headers=auth(token))

    study = client.get(f"/api/me/phrase-lists/{lid}/study", headers=auth(token))
    assert study.status_code == 200
    phrases = study.json()["phrases"]
    assert len(phrases) >= 1
    pid = phrases[0]["id"]

    r = client.post(f"/api/me/phrase-lists/phrases/{pid}/progress",
                    json={"quality": 5, "stage_completed": 0}, headers=auth(token))
    assert r.status_code == 200
    # Completing stage 0 with quality>=3 advances to stage 1
    assert r.json()["lesson_stage"] == 1

    with Session(database.engine) as s:
        prog = s.exec(select(UserCustomPhraseProgress).where(
            UserCustomPhraseProgress.custom_phrase_id == pid)).first()
        assert prog is not None
        assert prog.lesson_stage == 1


def test_study_word_tiles_for_long_phrases(client):
    # Issue #145: >3-word phrases get shuffled word_tiles for the stage-2
    # assembly step; short phrases get None and go straight to typed recall.
    email = "prem_tiles@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/phrase-lists/{lid}/phrases/bulk",
                json={"text": "Aš noriu juodos kavos dabar = Я хочу чёрный кофе сейчас\nLabas rytas = Доброе утро"},
                headers=auth(token))

    phrases = client.get(f"/api/me/phrase-lists/{lid}/study?star_level=3", headers=auth(token)).json()["phrases"]
    by_text = {p["text"]: p for p in phrases}

    long_tiles = by_text["Aš noriu juodos kavos dabar"]["word_tiles"]
    assert sorted(long_tiles) == sorted("Aš noriu juodos kavos dabar".split())
    assert long_tiles != "Aš noriu juodos kavos dabar".split()

    assert by_text["Labas rytas"]["word_tiles"] is None


def test_phrase_star_auto_assign_and_override(client):
    # Stars are auto-assigned from word count (<=3 -> 1, 4-6 -> 2, 7+ -> 3)
    # and can be manually overridden via PUT.
    email = "prem_star@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/phrase-lists/{lid}/phrases/bulk",
                json={"text": "Labas = Привет\n"
                              "Aš noriu juodos kavos = Я хочу чёрный кофе\n"
                              "Aš keliuosi, valausi dantis, pusryčiauju, geriu kavą kasdien = Я встаю каждый день"},
                headers=auth(token))

    detail = client.get(f"/api/me/phrase-lists/{lid}", headers=auth(token)).json()
    stars = {p["text"].split()[0] + str(len(p["text"].split())): p["star"] for p in detail["phrases"]}
    by_star = sorted(p["star"] for p in detail["phrases"])
    assert by_star == [1, 2, 3], f"unexpected stars: {stars}"

    # Manual override: bump the 1-word phrase to 3 stars
    short = next(p for p in detail["phrases"] if p["star"] == 1)
    r = client.put(f"/api/me/phrase-lists/phrases/{short['id']}",
                   json={"text": short["text"], "translation": short["translation"], "star": 3},
                   headers=auth(token))
    assert r.status_code == 200
    detail = client.get(f"/api/me/phrase-lists/{lid}", headers=auth(token)).json()
    assert next(p for p in detail["phrases"] if p["id"] == short["id"])["star"] == 3

    # Invalid star rejected
    r = client.put(f"/api/me/phrase-lists/phrases/{short['id']}",
                   json={"text": short["text"], "translation": short["translation"], "star": 5},
                   headers=auth(token))
    assert r.status_code == 422


def test_study_star_level_filter_and_all_known(client):
    email = "prem_star_study@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/phrase-lists/{lid}/phrases/bulk",
                json={"text": "Labas rytas = Доброе утро\n"
                              "Aš noriu juodos kavos = Я хочу чёрный кофе"},
                headers=auth(token))

    # Level 1: only the 2-word phrase
    study = client.get(f"/api/me/phrase-lists/{lid}/study?star_level=1", headers=auth(token)).json()
    assert [p["text"] for p in study["phrases"]] == ["Labas rytas"]

    # Level 2: both phrases
    study = client.get(f"/api/me/phrase-lists/{lid}/study?star_level=2", headers=auth(token)).json()
    assert len(study["phrases"]) == 2

    # Master the level-1 phrase (stage 0 -> 1 -> 2 with quality 5)
    pid = next(p["id"] for p in study["phrases"] if p["text"] == "Labas rytas")
    for stage in (0, 1, 2):
        client.post(f"/api/me/phrase-lists/phrases/{pid}/progress",
                    json={"quality": 5, "stage_completed": stage}, headers=auth(token))

    # Level 1 is now fully mastered -> all_known, offer advancing
    study = client.get(f"/api/me/phrase-lists/{lid}/study?star_level=1", headers=auth(token)).json()
    assert study["phrases"] == []
    assert study.get("all_known") is True

    # Level 2 still has the unlearned longer phrase
    study = client.get(f"/api/me/phrase-lists/{lid}/study?star_level=2", headers=auth(token)).json()
    assert [p["text"] for p in study["phrases"]] == ["Aš noriu juodos kavos"]


# ── Cascade deletes ───────────────────────────────────────────────────────────

def test_delete_list_cascades_phrases_and_progress(client):
    email = "prem_del_list@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/phrase-lists/{lid}/phrases/bulk",
                json={"text": "a = б\nc = д"}, headers=auth(token))
    study = client.get(f"/api/me/phrase-lists/{lid}/study", headers=auth(token)).json()
    pid = study["phrases"][0]["id"]
    client.post(f"/api/me/phrase-lists/phrases/{pid}/progress",
                json={"quality": 4, "stage_completed": 0}, headers=auth(token))

    r = client.delete(f"/api/me/phrase-lists/{lid}", headers=auth(token))
    assert r.status_code == 200

    with Session(database.engine) as s:
        assert s.get(CustomPhraseList, lid) is None
        assert s.exec(select(CustomPhrase).where(CustomPhrase.list_id == lid)).first() is None
        assert s.exec(select(UserCustomPhraseProgress).where(
            UserCustomPhraseProgress.custom_phrase_id == pid)).first() is None


def test_delete_user_cascades_custom_data(client):
    email = "prem_del_user@example.com"
    user_id = _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/phrase-lists/{lid}/phrases", json={"text": "x", "translation": "y"}, headers=auth(token))

    superadmin_token = make_token(SUPERADMIN_EMAIL, name="Artur")
    r = client.delete(f"/api/admin/users/{user_id}", headers=auth(superadmin_token))
    assert r.status_code == 200

    with Session(database.engine) as s:
        assert s.exec(select(CustomPhraseList).where(CustomPhraseList.owner_user_id == user_id)).first() is None
        assert s.exec(select(CustomPhrase).where(CustomPhrase.list_id == lid)).first() is None
