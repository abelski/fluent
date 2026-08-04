# Autotests for the Chrome extension API (routers/extension.py).
# Covers: word translation (DB-first, MyMemory fallback, privacy, caching,
# input validation), "Add to learn" (premium gate, auto-created
# "From internet" personal list, dedupe, list picker), and the public
# installation endpoints (info/download) used by the in-app extension page.

import io
import json
import zipfile
from pathlib import Path
from unittest.mock import Mock, patch

import httpx
import pytest
from sqlmodel import Session, select

import database
import routers.extension as extension
from models import User, Word, WordList, WordListItem

from tests.test_word_lists import make_token, auth, _make_premium, _create_list, SUPERADMIN_EMAIL

_EXTENSION_DIR = Path(__file__).resolve().parent.parent.parent / "extension"


_real_simplemma_lemma = extension._simplemma_lemma


@pytest.fixture(autouse=True)
def _no_real_wiktionary_calls(monkeypatch):
    """Safety net for every test in this file, including the ones written
    before dictionary enrichment existed: without this, any test that doesn't
    already mock these would trigger real side effects, because enrichment
    runs unconditionally on both the DB-hit and fallback paths (see _enrich):
    - _wiktionary_lookup would make a real network call to Wiktionary.
    - _simplemma_lemma does real (local, no-network) fuzzy lemmatization that
      can "recognize" throwaway test words as inflected forms of something
      else (e.g. simplemma maps "labasrytas" -> "labas"), which would then
      trigger an extra _mymemory_translate call old tests never accounted
      for. Stubbing both to a no-op by default keeps every pre-existing test
      byte-for-byte unaffected.
    Tests that need specific enrichment behavior override either for their
    own scope via `with patch.object(extension, "_wiktionary_lookup"/"_simplemma_lemma", ...)`.
    """
    monkeypatch.setattr(extension, "_wiktionary_lookup", lambda word: None)
    monkeypatch.setattr(extension, "_simplemma_lemma", lambda word: None)


@pytest.fixture(autouse=True)
def _no_real_google_fallback_calls(monkeypatch):
    """Same rationale as _no_real_wiktionary_calls: _translate_with_fallback
    (called via _translate_cached) reaches for _google_free_translate whenever
    MyMemory fails or returns a wrong-script result, which pre-existing tests
    never accounted for. Stub it to a no-op by default; tests that need the
    fallback behavior override it via `with patch.object(extension,
    "_google_free_translate", ...)`."""
    monkeypatch.setattr(extension, "_google_free_translate", lambda word, langpair: None)


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
    with patch.object(extension, "_mymemory_translate", return_value="русиско") as mock_fn:
        r = client.get(
            "/api/extension/translate",
            params={"word": "namasruonly", "lang": "ru"},
            headers=auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["translation_en"] is None
    assert body["translation_ru"] == "русиско"
    mock_fn.assert_called_once_with("namasruonly", "lt|ru")


def test_translate_lang_both_fetches_both_langpairs(client):
    email = "ext_lang_both@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    def fake_translate(word, langpair):
        return {"lt|en": "english-val", "lt|ru": "русское-значение"}[langpair]

    with patch.object(extension, "_mymemory_translate", side_effect=fake_translate):
        r = client.get(
            "/api/extension/translate",
            params={"word": "bothlangword", "lang": "both"},
            headers=auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["translation_en"] == "english-val"
    assert body["translation_ru"] == "русское-значение"


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
    with patch.object(extension, "_mymemory_translate", return_value="ру-значение") as mock_ru:
        r2 = client.get(
            "/api/extension/translate", params={"word": "cachewordxyz", "lang": "ru"}, headers=auth(token)
        )
        assert r2.status_code == 200
        assert r2.json()["translation_ru"] == "ру-значение"
        assert mock_ru.call_count == 1


# ── Translation quality fallback (MyMemory wrong-script bug) ──────────────────
# Real-world bug: MyMemory's lt->ru corpus is thin enough that it sometimes
# returns English text labeled as a Russian translation (e.g. "nepavykti" ->
# "fail" instead of "потерпеть неудачу"). _translate_with_fallback rejects
# any "|ru" result with no Cyrillic characters and retries via the free
# Google endpoint before giving up.

def test_translate_ru_wrong_script_falls_back_to_google(client):
    email = "ext_fallback_wrongscript@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    with patch.object(extension, "_mymemory_translate", return_value="fail"), \
         patch.object(extension, "_google_free_translate", return_value="неудача") as google_mock:
        r = client.get(
            "/api/extension/translate",
            params={"word": "fallbackwrongscript", "lang": "ru"},
            headers=auth(token),
        )
    assert r.status_code == 200
    assert r.json()["translation_ru"] == "неудача"
    google_mock.assert_called_once_with("fallbackwrongscript", "lt|ru")


def test_translate_mymemory_none_uses_google_fallback(client):
    email = "ext_fallback_none@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    with patch.object(extension, "_mymemory_translate", return_value=None), \
         patch.object(extension, "_google_free_translate", return_value="привет") as google_mock:
        r = client.get(
            "/api/extension/translate",
            params={"word": "fallbacknone", "lang": "ru"},
            headers=auth(token),
        )
    assert r.status_code == 200
    assert r.json()["translation_ru"] == "привет"
    assert google_mock.call_count == 1


def test_translate_both_sources_invalid_field_null_not_500(client):
    email = "ext_fallback_bothfail@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    # EN succeeds; RU fails the script check at both MyMemory and Google ->
    # translation_ru is null, response is still a normal 200 (not a 500).
    def fake_mm(word, langpair):
        return "good-en" if langpair == "lt|en" else "fail"

    with patch.object(extension, "_mymemory_translate", side_effect=fake_mm), \
         patch.object(extension, "_google_free_translate", return_value="also-not-cyrillic"):
        r = client.get(
            "/api/extension/translate",
            params={"word": "fallbackbothfail", "lang": "both"},
            headers=auth(token),
        )
    assert r.status_code == 200
    body = r.json()
    assert body["translation_en"] == "good-en"
    assert body["translation_ru"] is None

    # Both languages end up with nothing at all -> existing 404 logic still fires.
    with patch.object(extension, "_mymemory_translate", return_value=None), \
         patch.object(extension, "_google_free_translate", return_value=None):
        r2 = client.get(
            "/api/extension/translate",
            params={"word": "fallbacktotalfail", "lang": "both"},
            headers=auth(token),
        )
    assert r2.status_code == 404


def test_mymemory_translate_retries_once_on_request_error():
    """A connection-level failure (httpx.RequestError) is retried once; the
    successful second attempt's value is returned. No client/session needed —
    this hits _mymemory_translate directly and mocks httpx.get itself."""
    fake_response = Mock()
    fake_response.raise_for_status = Mock()
    fake_response.json = Mock(return_value={"responseData": {"translatedText": "house"}})
    mock_get = Mock(side_effect=[httpx.ConnectTimeout("boom"), fake_response])

    with patch.object(extension.httpx, "get", mock_get):
        result = extension._mymemory_translate("namas", "lt|en")

    assert result == "house"
    assert mock_get.call_count == 2


def test_mymemory_translate_does_not_retry_http_error_response():
    """An actual HTTP error response (raise_for_status) must fail immediately,
    not retry — only httpx.RequestError (connection/timeout) is retried."""
    fake_response = Mock()
    fake_response.raise_for_status = Mock(side_effect=httpx.HTTPStatusError(
        "500", request=Mock(), response=Mock()
    ))
    mock_get = Mock(return_value=fake_response)

    with patch.object(extension.httpx, "get", mock_get):
        result = extension._mymemory_translate("labas", "lt|en")

    assert result is None
    assert mock_get.call_count == 1


def test_lemma_translations_wrong_script_regression(client):
    """Regression test for the exact original bug report: the lemma
    'nepavykti' got 'fail' (English) as its Russian translation. This must be
    tested via _lemma_translations specifically — that's the code path the
    bug was actually discovered through (an inflected form, e.g. 'Nepavyko',
    resolving to this lemma)."""
    def fake_mm(word, langpair):
        return "fail" if (word, langpair) == ("nepavykti", "lt|ru") else None

    def fake_google(word, langpair):
        return "потерпеть неудачу" if langpair == "lt|ru" else None

    with Session(database.engine) as s:
        with patch.object(extension, "_mymemory_translate", side_effect=fake_mm), \
             patch.object(extension, "_google_free_translate", side_effect=fake_google) as google_mock:
            en, ru, accented = extension._lemma_translations("nepavykti", "both", s)

    assert ru == "потерпеть неудачу"
    assert ru != "fail"
    google_mock.assert_any_call("nepavykti", "lt|ru")


# ── Dictionary enrichment (base form, grammar, senses) ────────────────────────
# Words are unique per test — _WIKTIONARY_CACHE and _TRANSLATION_CACHE are
# module-level and persist for the whole pytest session.

def test_translate_inflected_word_full_enrichment_two_wiktionary_calls(client):
    email = "ext_enrich_full@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    def fake_wikt(word):
        if word == "enrichword1full":
            return {
                "part_of_speech": "Noun",
                "senses": [],
                "form_of": {"lemma": "enrichlemma1", "description": "locative plural of enrichlemma1"},
            }
        if word == "enrichlemma1":
            return {"part_of_speech": "Noun", "senses": ["sense one", "sense two"], "form_of": None}
        return None

    def fake_mm(word, langpair):
        return {("enrichword1full", "lt|en"): "inflected-en", ("enrichlemma1", "lt|en"): "lemma-en"}.get((word, langpair))

    with patch.object(extension, "_wiktionary_lookup", side_effect=fake_wikt) as wikt_mock, \
         patch.object(extension, "_mymemory_translate", side_effect=fake_mm):
        r = client.get("/api/extension/translate", params={"word": "enrichword1full"}, headers=auth(token))

    assert r.status_code == 200
    body = r.json()
    # Old-shape fields are untouched by enrichment.
    assert body["word"] == "enrichword1full"
    assert body["translation_en"] == "inflected-en"
    assert body["source"] == "mymemory"
    # New enrichment fields.
    assert body["base_form"] == "enrichlemma1"
    assert body["grammar_note"] == "locative plural of enrichlemma1"
    assert body["part_of_speech"] == "Noun"
    assert body["senses"] == ["sense one", "sense two"]
    assert body["base_translation_en"] == "lemma-en"
    assert body["base_translation_ru"] is None
    assert wikt_mock.call_count == 2  # selected word + lemma, each fetched once


def test_translate_lemma_word_gets_senses_no_grammar_note_one_call(client):
    email = "ext_enrich_lemma@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    with patch.object(extension, "_wiktionary_lookup", return_value={
        "part_of_speech": "Verb", "senses": ["to test"], "form_of": None,
    }) as wikt_mock, patch.object(extension, "_mymemory_translate", return_value="test-en"):
        r = client.get("/api/extension/translate", params={"word": "enrichlemma2"}, headers=auth(token))

    assert r.status_code == 200
    body = r.json()
    assert body["translation_en"] == "test-en"
    assert body["base_form"] == "enrichlemma2"
    assert body["grammar_note"] is None
    assert body["part_of_speech"] == "Verb"
    assert body["senses"] == ["to test"]
    assert wikt_mock.call_count == 1  # already the lemma — no second fetch


def test_translate_db_accented_preferred_for_base_form(client):
    email = "ext_enrich_accented@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    with Session(database.engine) as s:
        wl = WordList(title="Accent Test List", is_public=True)
        s.add(wl)
        s.commit()
        s.refresh(wl)
        w = Word(
            lithuanian="enrichlemma3",
            translation_en="lemma3-en-db",
            translation_ru="lemma3-ru-db",
            accented="en*rich*lemma3",
        )
        s.add(w)
        s.commit()
        s.refresh(w)
        s.add(WordListItem(word_list_id=wl.id, word_id=w.id, position=0))
        s.commit()

    def fake_wikt(word):
        if word == "enrichword3infl":
            return {
                "part_of_speech": "Noun",
                "senses": [],
                "form_of": {"lemma": "enrichlemma3", "description": "case of enrichlemma3"},
            }
        return None  # the lemma's own Wiktionary lookup "fails" — DB should win regardless

    with patch.object(extension, "_wiktionary_lookup", side_effect=fake_wikt), \
         patch.object(extension, "_mymemory_translate", return_value=None):
        r = client.get("/api/extension/translate", params={"word": "enrichword3infl"}, headers=auth(token))

    assert r.status_code == 200
    body = r.json()
    assert body["base_form"] == "enrichlemma3"
    assert body["base_form_accented"] == "en*rich*lemma3"
    assert body["base_translation_en"] == "lemma3-en-db"
    assert body["base_translation_ru"] == "lemma3-ru-db"


def test_translate_wiktionary_and_simplemma_miss_is_exact_old_shape(client):
    """Neither Wiktionary nor simplemma recognize the word — the response
    must be byte-for-byte the old shape, with every new field null."""
    email = "ext_enrich_none@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    with patch.object(extension, "_mymemory_translate", return_value="gibberish-en"):
        r = client.get("/api/extension/translate", params={"word": "qwxzptrqnotaword"}, headers=auth(token))

    assert r.status_code == 200
    body = r.json()
    assert body == {
        "word": "qwxzptrqnotaword",
        "translation_en": "gibberish-en",
        "translation_ru": None,
        "source": "mymemory",
        "base_form": None,
        "base_form_accented": None,
        "part_of_speech": None,
        "grammar_note": None,
        "senses": None,
        "base_translation_en": None,
        "base_translation_ru": None,
    }


def test_translate_simplemma_fallback_no_senses(client):
    """When Wiktionary has nothing, simplemma's real Lithuanian lemmatizer
    still supplies a base form + (via MyMemory) its translation — but never
    part_of_speech/grammar_note/senses, which only Wiktionary can provide."""
    email = "ext_enrich_simplemma@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    def fake_mm(word, langpair):
        return {("berniukų", "lt|en"): "boys-inflected-en", ("berniukas", "lt|en"): "boy-en"}.get((word, langpair))

    # Restore the real simplemma lemmatizer for this test only — the autouse
    # fixture stubs it out by default (see its docstring).
    with patch.object(extension, "_simplemma_lemma", _real_simplemma_lemma), \
         patch.object(extension, "_mymemory_translate", side_effect=fake_mm):
        r = client.get("/api/extension/translate", params={"word": "berniukų"}, headers=auth(token))

    assert r.status_code == 200
    body = r.json()
    assert body["translation_en"] == "boys-inflected-en"  # own translation, untouched
    assert body["base_form"] == "berniukas"                # simplemma('berniukų') == 'berniukas'
    assert body["base_translation_en"] == "boy-en"
    assert body["base_translation_ru"] is None
    assert body["senses"] is None
    assert body["part_of_speech"] is None
    assert body["grammar_note"] is None


def test_translate_wiktionary_cache_hit_and_failure_not_cached(client):
    email = "ext_enrich_wcache@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    with patch.object(extension, "_mymemory_translate", return_value="cached-en"), \
         patch.object(extension, "_wiktionary_lookup", return_value={
             "part_of_speech": "Noun", "senses": ["a sense"], "form_of": None,
         }) as wikt_mock:
        r1 = client.get("/api/extension/translate", params={"word": "wiktcachehit"}, headers=auth(token))
        assert r1.status_code == 200 and r1.json()["senses"] == ["a sense"]
        r2 = client.get("/api/extension/translate", params={"word": "wiktcachehit"}, headers=auth(token))
        assert r2.status_code == 200
        assert wikt_mock.call_count == 1  # second request served from _WIKTIONARY_CACHE

    with patch.object(extension, "_mymemory_translate", return_value="failnotcached-en"), \
         patch.object(extension, "_wiktionary_lookup", return_value=None) as wikt_fail_mock:
        r3 = client.get("/api/extension/translate", params={"word": "wiktcachefail"}, headers=auth(token))
        assert r3.status_code == 200 and r3.json()["senses"] is None
        r4 = client.get("/api/extension/translate", params={"word": "wiktcachefail"}, headers=auth(token))
        assert r4.status_code == 200
        assert wikt_fail_mock.call_count == 2  # failures are never cached, retried every time


def test_translate_lemma_not_in_db_mymemory_respects_lang(client):
    email = "ext_enrich_langru@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    def fake_wikt(word):
        if word == "enrichword5infl":
            return {
                "part_of_speech": "Noun",
                "senses": [],
                "form_of": {"lemma": "enrichlemma5", "description": "case of enrichlemma5"},
            }
        return None

    def fake_mm(word, langpair):
        return {
            ("enrichword5infl", "lt|ru"): "инфл-ру",
            ("enrichlemma5", "lt|ru"): "лемма-ру",
        }.get((word, langpair))

    with patch.object(extension, "_wiktionary_lookup", side_effect=fake_wikt), \
         patch.object(extension, "_mymemory_translate", side_effect=fake_mm) as mm_mock:
        r = client.get(
            "/api/extension/translate", params={"word": "enrichword5infl", "lang": "ru"}, headers=auth(token)
        )

    assert r.status_code == 200
    body = r.json()
    assert body["translation_ru"] == "инфл-ру"
    assert body["translation_en"] is None
    assert body["base_translation_ru"] == "лемма-ру"
    assert body["base_translation_en"] is None
    # lang=ru must never trigger an lt|en MyMemory call, for the word or its lemma.
    assert all(call.args[1] == "lt|ru" for call in mm_mock.call_args_list)


def test_translate_404_softening_uses_base_form_translation(client):
    email = "ext_enrich_soften@example.com"
    token = make_token(email)
    client.get("/api/me/quota", headers=auth(token))

    def fake_wikt(word):
        if word == "enrichword6infl":
            return {
                "part_of_speech": "Adjective",
                "senses": [],
                "form_of": {"lemma": "enrichlemma6", "description": "comparative of enrichlemma6"},
            }
        return None

    def fake_mm(word, langpair):
        return "lemma6-en" if (word, langpair) == ("enrichlemma6", "lt|en") else None

    with patch.object(extension, "_wiktionary_lookup", side_effect=fake_wikt), \
         patch.object(extension, "_mymemory_translate", side_effect=fake_mm):
        r = client.get("/api/extension/translate", params={"word": "enrichword6infl"}, headers=auth(token))

    assert r.status_code == 200  # softened — would have been 404 before enrichment
    body = r.json()
    assert body["word"] == "enrichword6infl"
    assert body["translation_en"] == "lemma6-en"
    assert body["translation_ru"] is None
    assert body["source"] == "mymemory"
    assert body["base_form"] == "enrichlemma6"
    assert body["base_translation_en"] == "lemma6-en"


def test_add_base_form_word_via_existing_endpoint_smoke(client):
    """The card's default "Add "<base form>"" button just POSTs the base
    form's own lithuanian/translation pair — no new server-side behavior."""
    email = "ext_add_baseform_smoke@example.com"
    _make_premium(client, email)
    token = make_token(email)
    r = client.post(
        "/api/extension/words",
        json={"lithuanian": "baseformsmoke", "translation": "smoke-en", "translation_ru": "smoke-ru"},
        headers=auth(token),
    )
    assert r.status_code == 200
    assert r.json()["already_added"] is False


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
