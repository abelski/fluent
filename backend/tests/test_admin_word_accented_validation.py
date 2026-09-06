# Autotests for issue #166: word.accented data-integrity guards.
#
# Covers:
#   (a) PATCH /api/admin/content/words/{id} accepts a correct `accented` value.
#   (b) The same endpoint rejects (400) an `accented` value whose asterisk-stripped
#       text doesn't match `lithuanian` — this is the write-time guard that closes
#       the recurrence path (backend/routers/admin.py::_accented_matches_lithuanian).
#   (c) A word-serving GET endpoint (routers/words.py::_safe_accented) falls back to
#       None for a word whose *stored* `accented` fails the invariant, so any
#       pre-existing corrupted row (or a row written before this guard shipped)
#       degrades to the frontend's `word.accented || word.lithuanian` fallback
#       instead of leaking a corrupted stress-marked string.
#
# See plans/triage/active/issue-166-elektroninis-accented-mismatch.md.

from sqlmodel import Session

import database
from models import Word, WordList, WordListItem

from tests.test_word_lists import make_token, auth, SUPERADMIN_EMAIL


def _admin_headers() -> dict:
    return auth(make_token(SUPERADMIN_EMAIL, name="Artur"))


def _create_word(lithuanian: str, translation_en="en", translation_ru="ru", accented=None) -> int:
    """Insert a Word directly, bypassing the write-time guard — used to seed a
    pre-existing mismatched row the way one could already exist in production
    (written before this guard shipped, or via direct DB access)."""
    with Session(database.engine) as s:
        w = Word(
            lithuanian=lithuanian,
            translation_en=translation_en,
            translation_ru=translation_ru,
            accented=accented,
        )
        s.add(w)
        s.commit()
        s.refresh(w)
        return w.id


def _create_public_list_with_word(word_id: int, title: str) -> int:
    with Session(database.engine) as s:
        wl = WordList(title=title, is_public=True)
        s.add(wl)
        s.commit()
        s.refresh(wl)
        s.add(WordListItem(word_list_id=wl.id, word_id=word_id, position=0))
        s.commit()
        return wl.id


# ── (a) PATCH accepts a correct accented value ───────────────────────────────

def test_patch_accepts_correct_accented(client):
    word_id = _create_word("elektroninis")
    r = client.patch(
        f"/api/admin/content/words/{word_id}",
        json={
            "lithuanian": "elektroninis",
            "translation_en": "electronic",
            "translation_ru": "электронный",
            "accented": "elek*tro*ninis",
        },
        headers=_admin_headers(),
    )
    assert r.status_code == 200
    with Session(database.engine) as s:
        w = s.get(Word, word_id)
        assert w.accented == "elek*tro*ninis"


# ── (b) PATCH rejects a mismatched accented value ────────────────────────────

def test_patch_rejects_mismatched_accented(client):
    """Regression test for the exact issue #166 bug: 'elek*tro*nis bi*lie*tas'
    (missing the 'ni') must never be accepted for lithuanian='elektroninis bilietas'."""
    word_id = _create_word("elektroninis bilietas")
    r = client.patch(
        f"/api/admin/content/words/{word_id}",
        json={
            "lithuanian": "elektroninis bilietas",
            "translation_en": "electronic ticket",
            "translation_ru": "электронный билет",
            "accented": "elek*tro*nis bi*lie*tas",
        },
        headers=_admin_headers(),
    )
    assert r.status_code == 400
    assert "accented" in r.json()["detail"]
    # A rejected PATCH must not partially apply — the word stays untouched.
    with Session(database.engine) as s:
        w = s.get(Word, word_id)
        assert w.accented is None


def test_patch_rejects_accented_missing_a_syllable(client):
    """A second mismatch shape (a whole trailing word dropped) to make sure the
    guard isn't accidentally scoped to just the one reported string."""
    word_id = _create_word("labas rytas")
    r = client.patch(
        f"/api/admin/content/words/{word_id}",
        json={
            "lithuanian": "labas rytas",
            "translation_en": "good morning",
            "translation_ru": "доброе утро",
            "accented": "la*bas",
        },
        headers=_admin_headers(),
    )
    assert r.status_code == 400


# ── (c) GET word-serving endpoint falls back for a stored invalid value ─────

def test_get_list_falls_back_when_stored_accented_is_invalid(client):
    """A word whose stored accented value fails the invariant (e.g. it predates
    this guard) must come back as None from a word-serving GET endpoint, not the
    corrupted string — matching the frontend's `word.accented || word.lithuanian`
    fallback (see routers/words.py::_safe_accented)."""
    word_id = _create_word(
        "elektroninis bilietas",
        translation_ru="электронный билет",
        accented="elek*tro*nis bi*lie*tas",  # stored corrupt value, bypassing the guard
    )
    list_id = _create_public_list_with_word(word_id, "Accented Fallback Test")

    r = client.get(f"/api/lists/{list_id}")
    assert r.status_code == 200
    words = {w["id"]: w for w in r.json()["words"]}
    assert words[word_id]["accented"] is None
    assert words[word_id]["lithuanian"] == "elektroninis bilietas"


def test_get_list_passes_through_valid_accented(client):
    """Sanity check for the same endpoint: a correctly-formed accented value is
    still served as-is — the fallback must not over-trigger on good data."""
    word_id = _create_word(
        "elektroninis laiškas",
        translation_ru="электронное письмо",
        accented="elek*tro*ninis laiškas",
    )
    list_id = _create_public_list_with_word(word_id, "Accented Passthrough Test")

    r = client.get(f"/api/lists/{list_id}")
    assert r.status_code == 200
    words = {w["id"]: w for w in r.json()["words"]}
    assert words[word_id]["accented"] == "elek*tro*ninis laiškas"
