# Autotests for the Chrome extension API (routers/extension.py).
# Covers: word translation (DB-first, MyMemory fallback, privacy, caching,
# input validation), "Add to learn" (premium gate, auto-created
# "From internet" personal list, dedupe, list picker), and the public
# installation endpoints (info/download) used by the in-app extension page.

import io
import json
import zipfile
from pathlib import Path
from unittest.mock import patch

from sqlmodel import Session, select

import database
import routers.extension as extension
from models import User, Word, WordList

from tests.test_word_lists import make_token, auth, _make_premium, _create_list, SUPERADMIN_EMAIL

_EXTENSION_DIR = Path(__file__).resolve().parent.parent.parent / "extension"


# ── Translate ────────────────────────────────────────────────────────────────

def test_translate_anon_401(client):
    r = client.get("/api/extension/translate", params={"word": "vienas"})
    assert r.status_code == 401


def test_translate_db_hit(client):
    email = "ext_translate_db@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))
    r = client.get("/api/extension/translate", params={"word": "vienas"}, headers=auth(token))
    assert r.status_code == 200
    body = r.json()
    assert body["translation_en"] == "one"
    assert body["translation_ru"] == "один"
    assert body["source"] == "db"


def test_translate_case_insensitive(client):
    email = "ext_translate_case@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))
    r = client.get("/api/extension/translate", params={"word": "VIENAS"}, headers=auth(token))
    assert r.status_code == 200
    assert r.json()["source"] == "db"


def test_translate_private_word_not_matched(client):
    """A word that only exists in another user's private personal list must never
    be returned by the translate lookup (WordList.is_public join guard)."""
    owner_email = "ext_owner@example.com"
    _make_premium(client, owner_email)
    owner_token = make_token(owner_email)
    lid = _create_list(client, owner_token)
    client.post(
        f"/api/me/word-lists/{lid}/words",
        json={"lithuanian": "unikalusprivatus", "translation": "секрет"},
        headers=auth(owner_token),
    )

    other_email = "ext_other@example.com"
    other_token = make_token(other_email)
    client.get("/api/me/quota", headers=auth(other_token))

    with patch.object(extension, "_mymemory_translate", return_value=None):
        r = client.get(
            "/api/extension/translate",
            params={"word": "unikalusprivatus"},
            headers=auth(other_token),
        )
    assert r.status_code == 404


def test_translate_mymemory_fallback_and_cache(client):
    email = "ext_mymemory@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    with patch.object(extension, "_mymemory_translate", return_value="hello") as mock_fn:
        r = client.get("/api/extension/translate", params={"word": "labasrytas"}, headers=auth(token))
        assert r.status_code == 200
        body = r.json()
        assert body["translation_en"] == "hello"
        assert body["translation_ru"] is None
        assert body["source"] == "mymemory"

        # Second lookup of the same word must be served from cache, not MyMemory again.
        r2 = client.get("/api/extension/translate", params={"word": "labasrytas"}, headers=auth(token))
        assert r2.status_code == 200
        assert mock_fn.call_count == 1


def test_translate_transient_failure_not_cached(client):
    """A MyMemory failure (None) must not be cached — the next request should
    retry the API instead of serving a permanent 404."""
    email = "ext_transient@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    with patch.object(extension, "_mymemory_translate", return_value=None) as mock_fail:
        r = client.get("/api/extension/translate", params={"word": "laikinasgedimas"}, headers=auth(token))
        assert r.status_code == 404
        assert mock_fail.call_count == 1

    with patch.object(extension, "_mymemory_translate", return_value="temporary failure") as mock_ok:
        r = client.get("/api/extension/translate", params={"word": "laikinasgedimas"}, headers=auth(token))
        assert r.status_code == 200
        assert mock_ok.call_count == 1


def test_translate_mymemory_none_404(client):
    email = "ext_mymemory_none@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))
    with patch.object(extension, "_mymemory_translate", return_value=None):
        r = client.get(
            "/api/extension/translate", params={"word": "zzznotranslation"}, headers=auth(token)
        )
    assert r.status_code == 404


def test_translate_invalid_input_422(client):
    email = "ext_invalid@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    # No letters at all.
    assert client.get(
        "/api/extension/translate", params={"word": "12345"}, headers=auth(token)
    ).status_code == 422

    # More than 4 tokens.
    assert client.get(
        "/api/extension/translate",
        params={"word": "one two three four five"},
        headers=auth(token),
    ).status_code == 422

    # Longer than 80 characters.
    assert client.get(
        "/api/extension/translate", params={"word": "a" * 81}, headers=auth(token)
    ).status_code == 422

    # Blank/whitespace only.
    assert client.get(
        "/api/extension/translate", params={"word": "   "}, headers=auth(token)
    ).status_code == 422


def test_translate_invalid_lang_422(client):
    email = "ext_lang_invalid@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))
    r = client.get(
        "/api/extension/translate", params={"word": "vienas", "lang": "fr"}, headers=auth(token)
    )
    assert r.status_code == 422


def test_translate_lang_ru_fetches_ru_langpair(client):
    email = "ext_lang_ru@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))
    with patch.object(extension, "_mymemory_translate", return_value="rusiskas") as mock_fn:
        r = client.get(
            "/api/extension/translate",
            params={"word": "namasruonly", "lang": "ru"},
            headers=auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["translation_en"] is None
    assert body["translation_ru"] == "rusiskas"
    mock_fn.assert_called_once_with("namasruonly", "lt|ru")


def test_translate_lang_both_fetches_both_langpairs(client):
    email = "ext_lang_both@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    def fake_translate(word, langpair):
        return {"lt|en": "english-val", "lt|ru": "russian-val"}[langpair]

    with patch.object(extension, "_mymemory_translate", side_effect=fake_translate):
        r = client.get(
            "/api/extension/translate",
            params={"word": "bothlangword", "lang": "both"},
            headers=auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["translation_en"] == "english-val"
    assert body["translation_ru"] == "russian-val"


def test_translate_lang_both_partial_failure_still_200(client):
    email = "ext_lang_partial@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    def fake_translate(word, langpair):
        return None if langpair == "lt|ru" else "only-english"

    with patch.object(extension, "_mymemory_translate", side_effect=fake_translate):
        r = client.get(
            "/api/extension/translate",
            params={"word": "partialword", "lang": "both"},
            headers=auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["translation_en"] == "only-english"
    assert body["translation_ru"] is None


def test_translate_cache_is_per_langpair(client):
    email = "ext_lang_cache@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    with patch.object(extension, "_mymemory_translate", return_value="en-val") as mock_en:
        r1 = client.get(
            "/api/extension/translate", params={"word": "cachewordxyz", "lang": "en"}, headers=auth(token)
        )
        assert r1.status_code == 200
        assert mock_en.call_count == 1

    # Same word, different lang — must NOT be served from the "en" cache entry.
    with patch.object(extension, "_mymemory_translate", return_value="ru-val") as mock_ru:
        r2 = client.get(
            "/api/extension/translate", params={"word": "cachewordxyz", "lang": "ru"}, headers=auth(token)
        )
        assert r2.status_code == 200
        assert r2.json()["translation_ru"] == "ru-val"
        assert mock_ru.call_count == 1


# ── Add to learn ─────────────────────────────────────────────────────────────

def test_add_anon_401(client):
    r = client.post("/api/extension/words", json={"lithuanian": "namas", "translation": "house"})
    assert r.status_code == 401


def test_add_non_premium_403(client):
    email = "ext_add_free@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))
    r = client.post(
        "/api/extension/words",
        json={"lithuanian": "namas", "translation": "house"},
        headers=auth(token),
    )
    assert r.status_code == 403


def test_add_creates_from_internet_list_and_dedupes(client):
    email = "ext_add_prem@example.com"
    _make_premium(client, email)
    token = make_token(email)

    r1 = client.post(
        "/api/extension/words",
        json={"lithuanian": "obuolys", "translation": "apple"},
        headers=auth(token),
    )
    assert r1.status_code == 200
    body1 = r1.json()
    assert body1["already_added"] is False
    list_id = body1["list_id"]

    # Second, different word reuses the same auto-created list.
    r2 = client.post(
        "/api/extension/words",
        json={"lithuanian": "kriause", "translation": "pear"},
        headers=auth(token),
    )
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["already_added"] is False
    assert body2["list_id"] == list_id

    with Session(database.engine) as s:
        wl = s.get(WordList, list_id)
        assert wl.title == "From internet"
        assert wl.is_public is False
        user = s.exec(select(User).where(User.email == email)).first()
        assert wl.created_by == user.id
        # Exactly one "From internet" list exists for this user.
        all_personal = s.exec(
            select(WordList).where(WordList.created_by == user.id, WordList.is_public == False)  # noqa: E712
        ).all()
        assert len(all_personal) == 1

    # Duplicate add (case-insensitive) does not create a new word or list.
    r3 = client.post(
        "/api/extension/words",
        json={"lithuanian": "OBUOLYS", "translation": "apple (dup)"},
        headers=auth(token),
    )
    assert r3.status_code == 200
    body3 = r3.json()
    assert body3["already_added"] is True
    assert body3["id"] == body1["id"]
    assert body3["list_id"] == list_id

    detail = client.get(f"/api/me/word-lists/{list_id}", headers=auth(token)).json()
    assert len(detail["words"]) == 2
    assert {w["lithuanian"] for w in detail["words"]} == {"obuolys", "kriause"}


def test_add_preserves_russian_translation(client):
    """A DB-hit add sends translation_ru — it must be stored, not mirrored EN."""
    email = "ext_add_ru@example.com"
    _make_premium(client, email)
    token = make_token(email)

    r = client.post(
        "/api/extension/words",
        json={"lithuanian": "vienas", "translation": "one", "translation_ru": "один"},
        headers=auth(token),
    )
    assert r.status_code == 200
    word_id = r.json()["id"]
    with Session(database.engine) as s:
        word = s.get(Word, word_id)
        assert word.translation_en == "one"
        assert word.translation_ru == "один"


def test_add_translation_ru_only_mirrors_into_en(client):
    """POST with only translation_ru (e.g. from a lang="ru" translate result)
    must mirror it into translation_en instead of rejecting the request."""
    email = "ext_add_ru_only@example.com"
    _make_premium(client, email)
    token = make_token(email)

    r = client.post(
        "/api/extension/words",
        json={"lithuanian": "tikslas", "translation_ru": "цель"},
        headers=auth(token),
    )
    assert r.status_code == 200
    word_id = r.json()["id"]
    with Session(database.engine) as s:
        word = s.get(Word, word_id)
        assert word.translation_en == "цель"
        assert word.translation_ru == "цель"


# ── List selection ───────────────────────────────────────────────────────────

def test_add_with_owned_list_id(client):
    email = "ext_list_owned@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token, title="My Custom List")

    r = client.post(
        "/api/extension/words",
        json={"lithuanian": "obuolys2", "translation": "apple", "list_id": lid},
        headers=auth(token),
    )
    assert r.status_code == 200
    body = r.json()
    assert body["list_id"] == lid
    assert body["already_added"] is False

    detail = client.get(f"/api/me/word-lists/{lid}", headers=auth(token)).json()
    assert any(w["lithuanian"] == "obuolys2" for w in detail["words"])


def test_add_with_other_users_list_id_404(client):
    owner_email = "ext_list_owner@example.com"
    _make_premium(client, owner_email)
    owner_token = make_token(owner_email)
    lid = _create_list(client, owner_token)

    other_email = "ext_list_other@example.com"
    _make_premium(client, other_email)
    other_token = make_token(other_email)

    r = client.post(
        "/api/extension/words",
        json={"lithuanian": "svetimas", "translation": "foreign", "list_id": lid},
        headers=auth(other_token),
    )
    assert r.status_code == 404


def test_add_with_public_list_id_404(client):
    email = "ext_list_public@example.com"
    _make_premium(client, email)
    token = make_token(email)

    r = client.post(
        "/api/extension/words",
        # id=1 is the seeded public "Test List" — must never be a valid target.
        json={"lithuanian": "viesas", "translation": "public", "list_id": 1},
        headers=auth(token),
    )
    assert r.status_code == 404


def test_add_without_list_id_still_uses_from_internet(client):
    email = "ext_list_default@example.com"
    _make_premium(client, email)
    token = make_token(email)

    r = client.post(
        "/api/extension/words",
        json={"lithuanian": "numatytasis", "translation": "default"},
        headers=auth(token),
    )
    assert r.status_code == 200
    with Session(database.engine) as s:
        wl = s.get(WordList, r.json()["list_id"])
        assert wl.title == "From internet"


def test_add_dedupe_is_per_list(client):
    email = "ext_list_dedupe@example.com"
    _make_premium(client, email)
    token = make_token(email)
    lid = _create_list(client, token, title="Second List")

    r1 = client.post(
        "/api/extension/words",
        json={"lithuanian": "unikalusdedupe", "translation": "unique"},
        headers=auth(token),
    )
    assert r1.status_code == 200
    assert r1.json()["already_added"] is False

    # Same word, but targeting a different explicit list — not a duplicate there.
    r2 = client.post(
        "/api/extension/words",
        json={"lithuanian": "unikalusdedupe", "translation": "unique", "list_id": lid},
        headers=auth(token),
    )
    assert r2.status_code == 200
    assert r2.json()["already_added"] is False
    assert r2.json()["list_id"] == lid
    assert r2.json()["id"] != r1.json()["id"]


def test_add_invalid_input_422(client):
    email = "ext_add_invalid@example.com"
    _make_premium(client, email)
    token = make_token(email)

    # Oversized translation.
    assert client.post(
        "/api/extension/words",
        json={"lithuanian": "namas", "translation": "x" * 201},
        headers=auth(token),
    ).status_code == 422

    # Oversized / non-word lithuanian (validated like translate input).
    assert client.post(
        "/api/extension/words",
        json={"lithuanian": "a" * 81, "translation": "house"},
        headers=auth(token),
    ).status_code == 422
    assert client.post(
        "/api/extension/words",
        json={"lithuanian": "12345", "translation": "house"},
        headers=auth(token),
    ).status_code == 422

    # Empty translation.
    assert client.post(
        "/api/extension/words",
        json={"lithuanian": "namas", "translation": "   "},
        headers=auth(token),
    ).status_code == 422

    # Both translation fields omitted entirely.
    assert client.post(
        "/api/extension/words",
        json={"lithuanian": "namas"},
        headers=auth(token),
    ).status_code == 422


def test_add_admin_non_premium(client):
    token = make_token(SUPERADMIN_EMAIL, name="Artur")
    r = client.post(
        "/api/extension/words",
        json={"lithuanian": "administracija", "translation": "administration"},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["already_added"] is False


# ── Installation info + download (public, no auth) ────────────────────────────

def test_extension_info_returns_manifest_version(client):
    r = client.get("/api/extension/info")
    assert r.status_code == 200
    manifest = json.loads((_EXTENSION_DIR / "manifest.json").read_text())
    assert r.json()["version"] == manifest["version"]


def test_extension_download_zip_contents(client):
    r = client.get("/api/extension/download")
    assert r.status_code == 200
    assert r.headers["content-type"] == "application/zip"

    manifest = json.loads((_EXTENSION_DIR / "manifest.json").read_text())
    assert manifest["version"] in r.headers["content-disposition"]

    zf = zipfile.ZipFile(io.BytesIO(r.content))
    names = zf.namelist()
    assert "fluent-extension/manifest.json" in names
    assert "fluent-extension/content.js" in names
    assert not any(n.endswith("README.md") for n in names)


def test_extension_info_and_download_are_public(client):
    # No Authorization header anywhere in this test — both endpoints must work
    # for anonymous visitors browsing the in-app extension page.
    assert client.get("/api/extension/info").status_code == 200
    assert client.get("/api/extension/download").status_code == 200
