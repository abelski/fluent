# Autotests for personal word lists ("Мои списки" for words).
# Covers entitlement gating, CRUD, bulk paste, ownership isolation on both the
# dedicated endpoints and the shared /lists study/browse endpoints, the
# "count everywhere" stats integration, distractor privacy, and cascade deletes.

from jose import jwt
from sqlmodel import Session, select

import database
from models import User, Word, WordList, WordListItem, UserWordProgress

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


def _create_list(client, token, title="List", difficulty=1) -> int:
    return client.post(
        "/api/me/word-lists", json={"title": title, "difficulty": difficulty}, headers=auth(token)
    ).json()["id"]


# ── Entitlement ───────────────────────────────────────────────────────────────

def test_unauthenticated_create_401(client):
    r = client.post("/api/me/word-lists", json={"title": "X", "difficulty": 1})
    assert r.status_code == 401


def test_non_premium_cannot_create(client):
    token = make_token("plain_wl@example.com")
    client.get("/api/me/quota", headers=auth(token))
    r = client.post("/api/me/word-lists", json={"title": "My list", "difficulty": 1}, headers=auth(token))
    assert r.status_code == 403


def test_admin_can_create(client):
    token = make_token(SUPERADMIN_EMAIL, name="Artur")
    r = client.post("/api/me/word-lists", json={"title": "Admin list", "difficulty": 1}, headers=auth(token))
    assert r.status_code == 200
    assert "id" in r.json()


def test_premium_can_create_and_list(client):
    email = "wl_prem_create@example.com"
    _make_premium(client, email)
    token = make_token(email)
    r = client.post("/api/me/word-lists", json={"title": "Travel", "difficulty": 2}, headers=auth(token))
    assert r.status_code == 200
    list_id = r.json()["id"]

    lists = client.get("/api/me/word-lists", headers=auth(token)).json()
    row = next((l for l in lists if l["id"] == list_id), None)
    assert row is not None and row["title"] == "Travel" and row["difficulty"] == 2


def test_empty_title_422(client):
    email = "wl_prem_empty@example.com"
    _make_premium(client, email)
    token = make_token(email)
    r = client.post("/api/me/word-lists", json={"title": "   ", "difficulty": 1}, headers=auth(token))
    assert r.status_code == 422


# ── Word add + bulk ───────────────────────────────────────────────────────────

def test_add_single_word(client):
    email = "wl_prem_add@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    r = client.post(f"/api/me/word-lists/{lid}/words", json={"lithuanian": "namas", "translation": "дом"}, headers=auth(token))
    assert r.status_code == 200
    detail = client.get(f"/api/me/word-lists/{lid}", headers=auth(token)).json()
    assert len(detail["words"]) == 1
    assert detail["words"][0]["lithuanian"] == "namas"
    assert detail["words"][0]["translation"] == "дом"
    assert detail["words"][0]["status"] == "new"


def test_add_empty_word_422(client):
    email = "wl_prem_add_empty@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    r = client.post(f"/api/me/word-lists/{lid}/words", json={"lithuanian": "  ", "translation": "дом"}, headers=auth(token))
    assert r.status_code == 422


def test_bulk_add_skips_malformed(client):
    email = "wl_prem_bulk@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    raw = "namas = дом\n\nrandomlinewithoutseparator\nknyga = книга\n  =  \nvanduo = вода"
    r = client.post(f"/api/me/word-lists/{lid}/words/bulk", json={"text": raw}, headers=auth(token))
    assert r.status_code == 200
    assert r.json()["added"] == 3
    detail = client.get(f"/api/me/word-lists/{lid}", headers=auth(token)).json()
    assert len(detail["words"]) == 3


def test_bulk_no_valid_lines_422(client):
    email = "wl_prem_bulk_bad@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    r = client.post(f"/api/me/word-lists/{lid}/words/bulk", json={"text": "no separators here\njust text"}, headers=auth(token))
    assert r.status_code == 422


def test_edit_and_delete_word(client):
    email = "wl_prem_edit@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    wid = client.post(f"/api/me/word-lists/{lid}/words", json={"lithuanian": "namas", "translation": "дом"}, headers=auth(token)).json()["id"]

    r = client.put(f"/api/me/word-lists/words/{wid}", json={"lithuanian": "namelis", "translation": "домик"}, headers=auth(token))
    assert r.status_code == 200
    detail = client.get(f"/api/me/word-lists/{lid}", headers=auth(token)).json()
    assert detail["words"][0]["lithuanian"] == "namelis"

    r = client.delete(f"/api/me/word-lists/words/{wid}", headers=auth(token))
    assert r.status_code == 200
    detail = client.get(f"/api/me/word-lists/{lid}", headers=auth(token)).json()
    assert len(detail["words"]) == 0


# ── Ownership isolation ───────────────────────────────────────────────────────

def test_non_owner_gets_404_everywhere(client):
    owner_email = "wl_owner@example.com"
    _make_premium(client, owner_email)
    owner_token = make_token(owner_email)
    lid = _create_list(client, owner_token, title="Private")
    client.post(f"/api/me/word-lists/{lid}/words", json={"lithuanian": "namas", "translation": "дом"}, headers=auth(owner_token))

    other_email = "wl_other@example.com"
    _make_premium(client, other_email)
    other_token = make_token(other_email)

    # Dedicated endpoint hidden from non-owner
    assert client.get(f"/api/me/word-lists/{lid}", headers=auth(other_token)).status_code == 404
    other_lists = client.get("/api/me/word-lists", headers=auth(other_token)).json()
    assert all(l["id"] != lid for l in other_lists)

    # Shared browse + study endpoints also guard the private list
    assert client.get(f"/api/lists/{lid}", headers=auth(other_token)).status_code == 404
    assert client.get(f"/api/lists/{lid}/study", headers=auth(other_token)).status_code == 404
    # Anonymous is blocked too
    assert client.get(f"/api/lists/{lid}").status_code == 404


# ── Study + "count everywhere" integration ────────────────────────────────────

def test_owner_studies_via_shared_endpoint_and_counts_in_stats(client):
    email = "wl_study@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/word-lists/{lid}/words/bulk", json={"text": "namas = дом\nknyga = книга"}, headers=auth(token))

    # Owner can study the personal list through the shared word study endpoint.
    study = client.get(f"/api/lists/{lid}/study", headers=auth(token))
    assert study.status_code == 200
    words = study.json()["words"]
    assert len(words) >= 1
    wid = words[0]["id"]

    # Recording progress via the shared endpoint marks the word known…
    r = client.post(f"/api/words/{wid}/progress", json={"status": "known", "quality": 5}, headers=auth(token))
    assert r.status_code == 200

    # …and it shows up in the global stats (count everywhere).
    stats = client.get("/api/me/stats", headers=auth(token)).json()
    assert stats["known"] >= 1

    # The personal-list summary reflects the known count too.
    summary = next(l for l in client.get("/api/me/word-lists", headers=auth(token)).json() if l["id"] == lid)
    assert summary["known"] >= 1


def test_personal_list_hidden_from_public_catalog(client):
    email = "wl_catalog@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token, title="Secret")
    client.post(f"/api/me/word-lists/{lid}/words", json={"lithuanian": "paslaptis", "translation": "секрет"}, headers=auth(token))

    catalog = client.get("/api/lists", headers=auth(token)).json()
    assert all(l["id"] != lid for l in catalog)


def test_personal_words_not_leaked_as_distractors(client):
    # A personal word must never appear as an MCQ distractor in another user's
    # public-list study session.
    owner_email = "wl_distractor_owner@example.com"
    _make_premium(client, owner_email)
    owner_token = make_token(owner_email)
    lid = _create_list(client, owner_token)
    unique_lt = "unikaliazodis"
    client.post(f"/api/me/word-lists/{lid}/words", json={"lithuanian": unique_lt, "translation": "уникум"}, headers=auth(owner_token))

    other_email = "wl_distractor_other@example.com"
    _make_premium(client, other_email)
    other_token = make_token(other_email)

    # Study the seeded public list (id=1) many times; the personal word must
    # never surface among distractors.
    for _ in range(8):
        resp = client.get("/api/lists/1/study", headers=auth(other_token))
        if resp.status_code != 200:
            continue
        distractors = resp.json().get("distractors", [])
        assert all(d["lithuanian"] != unique_lt for d in distractors)


# ── Cascade deletes ───────────────────────────────────────────────────────────

def test_delete_list_cascades_words_items_and_progress(client):
    email = "wl_del_list@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token)
    client.post(f"/api/me/word-lists/{lid}/words/bulk", json={"text": "namas = дом\nknyga = книга"}, headers=auth(token))
    words = client.get(f"/api/lists/{lid}/study", headers=auth(token)).json()["words"]
    wid = words[0]["id"]
    client.post(f"/api/words/{wid}/progress", json={"status": "learning"}, headers=auth(token))

    r = client.delete(f"/api/me/word-lists/{lid}", headers=auth(token))
    assert r.status_code == 200

    with Session(database.engine) as s:
        assert s.get(WordList, lid) is None
        assert s.exec(select(WordListItem).where(WordListItem.word_list_id == lid)).first() is None
        assert s.get(Word, wid) is None
        assert s.exec(select(UserWordProgress).where(UserWordProgress.word_id == wid)).first() is None
