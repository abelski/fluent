# Autotests for backend/verb_lookup.py — resolving a Lithuanian verb's
# principal forms (infinitive – 3rd-person present – 3rd-person past) so the
# study session can show "suprasti – supranta – suprato".
#
# Covers the three sources/outcomes the feature depends on:
#   1. curated `Verb` table hit (hand-verified, no network — must win),
#   2. Wiktionary HTML fallback, with the HTTP response mocked,
#   3. graceful None on any lookup failure (HTTP error, unparseable HTML),
# plus the end-to-end `add_my_word` path, which must never be blocked by a
# failing/unreachable Wiktionary.
#
# NOTE: conftest.py autouse-stubs `verb_lookup.wiktionary_verb_forms` to a miss
# for the whole suite so no test ever scrapes the real site. Tests here that
# exercise the scraper itself use the `real_wiktionary_verb_forms` fixture below
# to restore it for their own scope.

from unittest.mock import Mock, patch

import httpx
import pytest
from sqlmodel import Session, select

import database
import verb_lookup
from models import Verb, Word, WordListItem

from tests.test_word_lists import make_token, auth, _make_premium, _create_list

# Captured at import time — i.e. before conftest's autouse stub replaces it.
_REAL_WIKTIONARY_VERB_FORMS = verb_lookup.wiktionary_verb_forms


@pytest.fixture
def real_wiktionary_verb_forms(monkeypatch):
    """Undo conftest's suite-wide stub so the parser itself can be tested
    (its network call is mocked at the httpx level by each test)."""
    monkeypatch.setattr(
        verb_lookup, "wiktionary_verb_forms", _REAL_WIKTIONARY_VERB_FORMS
    )
    return _REAL_WIKTIONARY_VERB_FORMS


def _seed_curated_verb(infinitive: str, present: str, past: str) -> None:
    with Session(database.engine) as s:
        existing = s.exec(select(Verb).where(Verb.infinitive == infinitive)).first()
        if existing:
            return
        s.add(Verb(
            number=9001,
            infinitive=infinitive,
            present_3p=present,
            past_3p=past,
            translation_ru="говорить",
            translation="to speak",
        ))
        s.commit()


# A trimmed copy of the real Wiktionary page structure for "suprasti": the
# Lithuanian section with the verb headword line stating both principal forms.
_WIKT_HTML = """<html><body>
<h2 id="Latvian">Latvian</h2>
<p><strong class="Latn headword" lang="lv">nesuprasti</strong> (<i>third-person present tense</i>
<b><a href="/wiki/wrong" title="wrongpresent">wrongpresent</a></b>,
<i>third-person past tense</i> <b><a href="/wiki/wrong2" title="wrongpast">wrongpast</a></b>)</p>
<h2 id="Lithuanian">Lithuanian</h2>
<h3 id="Verb">Verb</h3>
<p><strong class="Latn headword" lang="lt">supra&#768;sti</strong> (<i>third-person present tense</i>
<b class="Latn" lang="lt"><a rel="mw:WikiLink" href="./supranta" title="supranta">supran&#771;ta</a></b>,
<i>third-person past tense</i> <b class="Latn" lang="lt"><a rel="mw:WikiLink" href="./suprato" title="suprato">supra&#771;to</a></b>)</p>
</body></html>"""


# ── wiktionary_verb_forms ────────────────────────────────────────────────────

def test_wiktionary_verb_forms_parses_headword_line(real_wiktionary_verb_forms):
    """Both principal forms come from the Lithuanian section's headword line,
    with Wiktionary's stress marks stripped (supran̄ta -> supranta)."""
    resp = Mock(text=_WIKT_HTML)
    resp.raise_for_status = Mock()
    with patch.object(verb_lookup.httpx, "get", return_value=resp) as get_mock:
        forms = real_wiktionary_verb_forms("suprasti")

    assert forms == {"present_3p": "supranta", "past_3p": "suprato"}
    # Only the Lithuanian section is read — the Latvian homograph above it
    # must not leak in (asserted by the values, not just the section slice).
    assert get_mock.call_count == 1
    assert "suprasti" in get_mock.call_args[0][0]


def test_wiktionary_verb_forms_http_error_returns_none(real_wiktionary_verb_forms):
    """A network/HTTP failure is a miss, never an exception."""
    with patch.object(
        verb_lookup.httpx, "get", side_effect=httpx.ConnectError("boom")
    ):
        assert real_wiktionary_verb_forms("suprasti") is None

    resp = Mock(text="")
    resp.raise_for_status = Mock(
        side_effect=httpx.HTTPStatusError("404", request=Mock(), response=Mock())
    )
    with patch.object(verb_lookup.httpx, "get", return_value=resp):
        assert real_wiktionary_verb_forms("qwxzptrqnotaword") is None


def test_wiktionary_verb_forms_unparseable_html_returns_none(real_wiktionary_verb_forms):
    """Page exists but has no Lithuanian section / no recognisable verb forms."""
    for html in (
        "<html><body><h2 id=\"Latvian\">Latvian</h2><p>nothing here</p></body></html>",
        "<html><body><h2 id=\"Lithuanian\">Lithuanian</h2><h3>Noun</h3><p>a noun</p></body></html>",
        "not html at all",
    ):
        resp = Mock(text=html)
        resp.raise_for_status = Mock()
        with patch.object(verb_lookup.httpx, "get", return_value=resp):
            assert real_wiktionary_verb_forms("whatever") is None


# ── enrich_verb_forms ────────────────────────────────────────────────────────

def test_enrich_verb_forms_prefers_curated_table(client):
    """The hand-verified curated `Verb` row wins and no network call happens."""
    _seed_curated_verb("kalbėti", "kalba", "kalbėjo")
    with Session(database.engine) as s:
        with patch.object(verb_lookup, "wiktionary_verb_forms") as wikt_mock:
            result = verb_lookup.enrich_verb_forms(s, "kalbėti", None)

    assert result == {
        "part_of_speech": "verb",
        "verb_present_3p": "kalba",
        "verb_past_3p": "kalbėjo",
    }
    assert wikt_mock.call_count == 0


def test_enrich_verb_forms_matches_stressed_curated_infinitive(client):
    """The curated `Verb` table stores textbook-stressed infinitives
    ("kalbė́ti") while `Word.lithuanian` is always plain ("kalbėti"), so matching
    must ignore stress marks — otherwise the curated source, which the plan
    requires to take priority, would miss nearly every word. The forms it
    returns are stripped too: the app never shows stress marks (issue #116) and
    this line renders next to the plain infinitive."""
    _seed_curated_verb("riñkti", "rẽnka", "rĩnko")  # riñkti / reñka / riñko
    with Session(database.engine) as s:
        with patch.object(verb_lookup, "wiktionary_verb_forms") as wikt_mock:
            result = verb_lookup.enrich_verb_forms(s, "rinkti", None)

    assert result == {
        "part_of_speech": "verb",
        "verb_present_3p": "renka",
        "verb_past_3p": "rinko",
    }
    assert wikt_mock.call_count == 0


def test_enrich_verb_forms_falls_back_to_wiktionary(client):
    """Not in the curated table -> the (mocked) Wiktionary scrape supplies the
    forms and marks the word as a verb."""
    with Session(database.engine) as s:
        with patch.object(
            verb_lookup,
            "wiktionary_verb_forms",
            return_value={"present_3p": "supranta", "past_3p": "suprato"},
        ):
            result = verb_lookup.enrich_verb_forms(s, "suprasti", "Verb")

    assert result == {
        "part_of_speech": "verb",
        "verb_present_3p": "supranta",
        "verb_past_3p": "suprato",
    }


def test_enrich_verb_forms_lookup_failure_returns_all_none(client):
    """Both sources miss -> all-None fields, the caller's part_of_speech kept,
    and nothing raised. This is the "no partial line" guarantee at the source:
    the two conjugated forms are always either both set or both null."""
    with Session(database.engine) as s:
        with patch.object(verb_lookup, "wiktionary_verb_forms", return_value=None):
            result = verb_lookup.enrich_verb_forms(s, "qwxzptrqnotaword", "Verb")
        assert result == {
            "part_of_speech": "Verb",
            "verb_present_3p": None,
            "verb_past_3p": None,
        }

        # Even an outright exception from the lookup is swallowed.
        with patch.object(
            verb_lookup, "wiktionary_verb_forms", side_effect=RuntimeError("boom")
        ):
            result = verb_lookup.enrich_verb_forms(s, "qwxzptrqnotaword", "Verb")
        assert result == {
            "part_of_speech": "Verb",
            "verb_present_3p": None,
            "verb_past_3p": None,
        }


def test_enrich_verb_forms_known_non_verb_skips_network(client):
    """A word already known to be a noun never pays for the slow scrape."""
    with Session(database.engine) as s:
        with patch.object(verb_lookup, "wiktionary_verb_forms") as wikt_mock:
            result = verb_lookup.enrich_verb_forms(s, "berniukas", "Noun")

    assert result["verb_present_3p"] is None
    assert result["verb_past_3p"] is None
    assert result["part_of_speech"] == "Noun"
    assert wikt_mock.call_count == 0


# ── homonym-ambiguity guard ("arti" = adverb "near" AND verb "to plow") ────────
#
# Real bug found via user testing: `arti`, whose Word row means "near", got
# tagged as a verb with forms belonging to the unrelated "to plow" sense,
# because the Wiktionary page for "arti" has a verb section under the same
# Lithuanian headword. `enrich_verb_forms` must not trust a scraped verb
# section unless either (a) Wiktionary's part-of-speech listing shows only
# "verb" for this headword, or (b) the caller already knows — e.g. from the
# app's own `Word.hint` tagging — that this word's actual sense is a verb.

def test_enrich_verb_forms_skips_ambiguous_homonym(client):
    """Unconfirmed part_of_speech + Wiktionary lists multiple senses (verb AND
    something else) -> the scrape is never trusted, no forms come back."""
    with Session(database.engine) as s:
        with patch.object(
            verb_lookup, "_wiktionary_pos_set", return_value={"adverb", "verb"}
        ):
            with patch.object(verb_lookup, "wiktionary_verb_forms") as wikt_mock:
                result = verb_lookup.enrich_verb_forms(s, "arti", None)

    assert result == {"part_of_speech": None, "verb_present_3p": None, "verb_past_3p": None}
    assert wikt_mock.call_count == 0


def test_enrich_verb_forms_participle_entry_is_not_treated_as_ambiguous(client):
    """Real bug found via manual testing: Wiktionary lists "valgyti" ("to eat")
    as {"participle", "verb"} — but its "Participle" entry is the verb's own
    non-finite form (a `form-of-definition` pointing back at "valgyti"
    itself), not an unrelated word sense like "arti"'s adverb/verb split.
    Treating it as ambiguous would block ordinary, unambiguous verbs from
    ever being enriched via Wiktionary."""
    with Session(database.engine) as s:
        with patch.object(
            verb_lookup, "_wiktionary_pos_set", return_value={"participle", "verb"}
        ):
            with patch.object(
                verb_lookup,
                "wiktionary_verb_forms",
                return_value={"present_3p": "valgo", "past_3p": "valgė"},
            ):
                result = verb_lookup.enrich_verb_forms(s, "valgyti", None)

    assert result == {"part_of_speech": "verb", "verb_present_3p": "valgo", "verb_past_3p": "valgė"}


def test_enrich_verb_forms_proceeds_when_pos_set_unambiguous(client):
    """Wiktionary lists only "verb" for this headword -> the scrape proceeds
    normally."""
    with Session(database.engine) as s:
        with patch.object(verb_lookup, "_wiktionary_pos_set", return_value={"verb"}):
            with patch.object(
                verb_lookup,
                "wiktionary_verb_forms",
                return_value={"present_3p": "supranta", "past_3p": "suprato"},
            ):
                result = verb_lookup.enrich_verb_forms(s, "suprasti", None)

    assert result["verb_present_3p"] == "supranta"
    assert result["verb_past_3p"] == "suprato"


def test_enrich_verb_forms_proceeds_when_pos_lookup_fails(client):
    """The definition-endpoint lookup itself failing (None, not an empty set)
    must not block enrichment -> conservative fallback is to still try the
    scrape rather than silently losing coverage whenever that endpoint hiccups."""
    with Session(database.engine) as s:
        with patch.object(verb_lookup, "_wiktionary_pos_set", return_value=None):
            with patch.object(
                verb_lookup,
                "wiktionary_verb_forms",
                return_value={"present_3p": "supranta", "past_3p": "suprato"},
            ):
                result = verb_lookup.enrich_verb_forms(s, "suprasti", None)

    assert result["verb_present_3p"] == "supranta"


def test_enrich_verb_forms_hint_confirmed_verb_bypasses_ambiguity_check(client):
    """When the caller already knows (e.g. from the app's own `Word.hint`
    tagging) that this word's sense is a verb, the homonym guard is skipped
    entirely -- the app's own labelling of *this* word row is authoritative,
    even though Wiktionary's page lists another, unrelated sense too."""
    with Session(database.engine) as s:
        with patch.object(verb_lookup, "_wiktionary_pos_set") as pos_mock:
            with patch.object(
                verb_lookup,
                "wiktionary_verb_forms",
                return_value={"present_3p": "aria", "past_3p": "arė"},
            ):
                result = verb_lookup.enrich_verb_forms(s, "arti", "verb")

    assert result == {"part_of_speech": "verb", "verb_present_3p": "aria", "verb_past_3p": "arė"}
    pos_mock.assert_not_called()


# ── lazy_enrich_word / lazy_enrich_words ─────────────────────────────────────
#
# On-demand enrichment run right before a word is served (study/review queues),
# instead of relying solely on the standalone backfill script — so real usage
# progressively fills in forms for whatever vocabulary users actually study.

def _make_word(lithuanian: str, hint: str | None = None) -> Word:
    with Session(database.engine) as s:
        w = Word(lithuanian=lithuanian, translation_en="x", translation_ru="х", hint=hint)
        s.add(w)
        s.commit()
        s.refresh(w)
        return w


def test_lazy_enrich_word_curated_hit_needs_no_budget(client):
    """A curated-table match is a pure DB read -> no budget required at all."""
    _seed_curated_verb("kalbėti", "kalba", "kalbėjo")
    w = _make_word("kalbėti")
    with Session(database.engine) as s:
        with patch.object(verb_lookup, "wiktionary_verb_forms") as wikt_mock:
            changed = verb_lookup.lazy_enrich_word(s, w, wiktionary_budget=[0])

    assert changed is True
    assert w.part_of_speech == "verb"
    assert w.verb_present_3p == "kalba"
    assert w.verb_past_3p == "kalbėjo"
    assert wikt_mock.call_count == 0


def test_lazy_enrich_word_hint_confirmed_nonverb_needs_no_budget(client):
    """A word already hint-tagged non-verb is persisted with zero budget."""
    w = _make_word("berniukas", hint="daiktavardis")
    with Session(database.engine) as s:
        with patch.object(verb_lookup, "wiktionary_verb_forms") as wikt_mock:
            changed = verb_lookup.lazy_enrich_word(s, w, wiktionary_budget=[0])

    assert changed is True
    assert w.part_of_speech == "noun"
    assert w.verb_present_3p is None
    assert wikt_mock.call_count == 0


def test_lazy_enrich_word_skips_network_path_without_budget(client):
    """An unhinted single-token word not in the curated table needs a network
    lookup -> with zero budget it is left untouched, to be retried later."""
    w = _make_word("suprasti")
    with Session(database.engine) as s:
        with patch.object(
            verb_lookup, "wiktionary_verb_forms", return_value={"present_3p": "supranta", "past_3p": "suprato"}
        ) as wikt_mock:
            changed = verb_lookup.lazy_enrich_word(s, w, wiktionary_budget=[0])

    assert changed is False
    assert w.part_of_speech is None
    assert wikt_mock.call_count == 0


def test_lazy_enrich_word_uses_network_path_with_budget(client):
    """Same word, budget available -> the lookup runs and the budget counter
    (shared across a batch) is decremented."""
    w = _make_word("suprasti")
    budget = [2]
    with Session(database.engine) as s:
        with patch.object(
            verb_lookup, "_wiktionary_pos_set", return_value={"verb"}
        ), patch.object(
            verb_lookup, "wiktionary_verb_forms", return_value={"present_3p": "supranta", "past_3p": "suprato"}
        ):
            changed = verb_lookup.lazy_enrich_word(s, w, wiktionary_budget=budget)

    assert changed is True
    assert w.verb_present_3p == "supranta"
    assert budget == [1]


def test_lazy_enrich_word_already_enriched_is_a_no_op(client):
    """A word that already has part_of_speech set is left alone entirely —
    no curated lookup, no network, nothing to do."""
    w = _make_word("suprasti")
    w_id = w.id
    with Session(database.engine) as s:
        stored = s.get(Word, w_id)
        stored.part_of_speech = "verb"
        stored.verb_present_3p = "supranta"
        stored.verb_past_3p = "suprato"
        s.add(stored)
        s.commit()

    with Session(database.engine) as s:
        stored = s.get(Word, w_id)
        with patch.object(verb_lookup, "wiktionary_verb_forms") as wikt_mock:
            changed = verb_lookup.lazy_enrich_word(s, stored)

    assert changed is False
    assert wikt_mock.call_count == 0


def test_lazy_enrich_words_commits_batch_and_respects_budget(client):
    """A batch of words: curated/hint-confirmed ones are always enriched, and
    only as many network-bound words as the budget allows get resolved in one
    call — the rest are left for a future request to pick up."""
    _seed_curated_verb("kalbėti", "kalba", "kalbėjo")
    curated_word = _make_word("kalbėti2", hint=None)
    # Force a curated match for this row's own lithuanian instead of relying on
    # a second seed — simpler to just seed a second curated verb.
    with Session(database.engine) as s:
        existing = s.exec(select(Verb).where(Verb.infinitive == "kalbėti2")).first()
        if not existing:
            s.add(Verb(number=9002, infinitive="kalbėti2", present_3p="kalba2", past_3p="kalbėjo2",
                        translation_ru="х", translation="x"))
            s.commit()

    nonverb_word = _make_word("mašina", hint="daiktavardis")
    network_word_a = _make_word("duoti")
    network_word_b = _make_word("eiti")

    with Session(database.engine) as s:
        words = [
            s.get(Word, curated_word.id),
            s.get(Word, nonverb_word.id),
            s.get(Word, network_word_a.id),
            s.get(Word, network_word_b.id),
        ]
        with patch.object(verb_lookup, "_wiktionary_pos_set", return_value={"verb"}):
            with patch.object(
                verb_lookup, "wiktionary_verb_forms",
                return_value={"present_3p": "x", "past_3p": "y"},
            ) as wikt_mock:
                verb_lookup.lazy_enrich_words(s, words, wiktionary_budget=1)

        assert wikt_mock.call_count == 1  # only one of the two network-bound words

    with Session(database.engine) as s:
        assert s.get(Word, curated_word.id).part_of_speech == "verb"
        assert s.get(Word, nonverb_word.id).part_of_speech == "noun"
        network_results = [s.get(Word, network_word_a.id).part_of_speech,
                            s.get(Word, network_word_b.id).part_of_speech]
        # Exactly one of the two network-bound words got resolved; the other
        # stays null, to be retried on a future request.
        assert network_results.count("verb") == 1
        assert network_results.count(None) == 1


# ── part_of_speech_from_hint ─────────────────────────────────────────────────

def test_part_of_speech_from_hint_maps_known_values():
    assert verb_lookup.part_of_speech_from_hint("veiksmažodis") == "verb"
    assert verb_lookup.part_of_speech_from_hint("глагол") == "verb"
    assert verb_lookup.part_of_speech_from_hint("daiktavardis") == "noun"
    assert verb_lookup.part_of_speech_from_hint("būdvardis") == "adjective"
    assert verb_lookup.part_of_speech_from_hint("šalis") == "noun"


def test_part_of_speech_from_hint_none_for_unset_or_free_text():
    assert verb_lookup.part_of_speech_from_hint(None) is None
    assert verb_lookup.part_of_speech_from_hint("") is None
    assert verb_lookup.part_of_speech_from_hint("m. / f.") is None
    assert verb_lookup.part_of_speech_from_hint("neišlaikyti + gen.") is None


# ── add_my_word integration ──────────────────────────────────────────────────

def _add_word(client, token, list_id, lithuanian, translation):
    return client.post(
        f"/api/me/word-lists/{list_id}/words",
        json={"lithuanian": lithuanian, "translation": translation},
        headers=auth(token),
    )


def test_add_my_word_verb_gets_forms(client):
    """Adding a curated verb to a personal list populates the three fields, so
    the word carries its principal forms into the study session."""
    _seed_curated_verb("kalbėti", "kalba", "kalbėjo")
    email = "verbforms_add@example.com"
    _make_premium(client, email)
    token = make_token(email)
    list_id = _create_list(client, token, title="Verb List")

    r = _add_word(client, token, list_id, "kalbėti", "говорить")
    assert r.status_code == 200
    word_id = r.json()["id"]

    with Session(database.engine) as s:
        w = s.get(Word, word_id)
        assert w.part_of_speech == "verb"
        assert w.verb_present_3p == "kalba"
        assert w.verb_past_3p == "kalbėjo"


def test_add_my_word_survives_unreachable_wiktionary(client):
    """Wiktionary down/unreachable must never block or fail word creation —
    the word is stored with null verb fields."""
    email = "verbforms_add_fail@example.com"
    _make_premium(client, email)
    token = make_token(email)
    list_id = _create_list(client, token, title="Verb List 2")

    with patch.object(
        verb_lookup, "wiktionary_verb_forms", side_effect=httpx.ConnectError("dns")
    ):
        r = _add_word(client, token, list_id, "qwxzptrqverbword", "тест")

    assert r.status_code == 200
    with Session(database.engine) as s:
        w = s.get(Word, r.json()["id"])
        assert w.lithuanian == "qwxzptrqverbword"
        assert w.part_of_speech is None
        assert w.verb_present_3p is None
        assert w.verb_past_3p is None
        assert s.exec(
            select(WordListItem).where(WordListItem.word_id == w.id)
        ).first() is not None
