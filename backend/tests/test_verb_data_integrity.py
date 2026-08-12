# Issues #151 / #153 — corrupt conjugation forms must never be served as questions.
#
# The verb PDF sets stress marks as zero-width glyphs positioned by absolute x, so any
# whitespace-based reading of a row mis-segments it: the mark becomes its own token and
# every later tense column shifts one to the right. Production held 169 forms that were
# nothing but a combining accent, truncated stems like "kalb̃" (issue #153), bare endings
# like "ame", and past-tense forms sitting in the conditional column.
#
# extract_verbs_pdf.py now reads chars and cuts rows at the page's real column corridors,
# so the data is clean. These tests pin the server-side guard that stands behind it —
# it should be a no-op on good data and must stay that way.

import json

import pytest
from sqlmodel import Session

import database as _db
from models import Verb
from grammar_service import (
    _base_letters,
    _clean_form,
    _generate_verb_conjugation_tasks,
    _has_misplaced_tone_mark,
    _is_usable_form,
    _verb_stem,
)

# conftest's create_all ran before Verb was imported, so its table does not exist yet.
Verb.__table__.create(_db.engine, checkfirst=True)

# Verb 89 (kalbė́ti) exactly as issue #153 found it in production.
_CORRUPT_89 = {
    "indicative_present": {
        "aš": "kalbù", "tu": "kalbì",
        "jis, ji, jie, jos": "kalb̃", "mes": "kalb̃", "jūs": "kalb̃",
    },
    "indicative_past_simple": {
        "aš": "kalbė́jau", "tu": "kalbė́jai",
        "jis, ji, jie, jos": "a", "mes": "ame", "jūs": "ate",
    },
    "indicative_future": {
        "aš": "kalbė́siu", "tu": "kalbė́si",
        "jis, ji, jie, jos": "kalbės̃", "mes": "kalbė́sime", "jūs": "kalbė́site",
    },
    "conditional": {
        "aš": "kalbė́čiau", "tu": "kalbė́tum",
        # past-simple forms parked in the conditional column
        "jis, ji, jie, jos": "kalbė́jo", "mes": "kalbė́jome", "jūs": "kalbė́jote",
    },
}

# The same verb after the fix.
_CLEAN_89 = {
    "indicative_present": {
        "aš": "kalbù", "tu": "kalbì",
        "jis, ji, jie, jos": "kal̃ba", "mes": "kal̃bame", "jūs": "kal̃bate",
    },
    "conditional": {
        "aš": "kalbė́čiau", "tu": "kalbė́tum", "jis, ji, jie, jos": "kalbė́tų",
        "mes": "kalbė́tume / kalbė́tumėme", "jūs": "kalbė́tute / kalbė́tumėte",
    },
}


class TestHelpers:
    def test_base_letters_drops_marks_and_space(self):
        assert _base_letters("kal̃ba") == "kalba"
        assert _base_letters("tegu kal̃ba") == "tegukalba"
        assert _base_letters("̃") == ""

    def test_verb_stem_strips_infinitive_ending(self):
        assert _verb_stem("kalbė́ti") == "kalbe"
        assert _verb_stem("kalbė́tis") == "kalbe"

    @pytest.mark.parametrize("form", ["kalbės̃", "baig̃", "dės̃", "turės̃"])
    def test_tone_mark_on_non_carrier_is_flagged(self, form):
        assert _has_misplaced_tone_mark(form) is True

    @pytest.mark.parametrize("form", ["kal̃ba", "kalbė̃s", "kalbì", "atsakýtum", "lañko"])
    def test_tone_mark_on_a_carrier_is_accepted(self, form):
        assert _has_misplaced_tone_mark(form) is False


class TestIsUsableForm:
    @pytest.mark.parametrize(
        "form,tense",
        [
            ("̃", "indicative_past_simple"),          # lone combining tilde
            ("̀", "conditional"),                     # lone combining grave
            ("kalb̃", "indicative_present"),          # the #153 defect: truncated stem
            ("a", "indicative_past_simple"),          # bare ending, stem lost
            ("ame", "indicative_past_simple"),
            ("kalbės̃", "indicative_future"),         # tilde displaced onto "s"
            ("kalbė́jo", "conditional"),              # past form in the conditional column
            ("kalbė́jome", "conditional"),
        ],
    )
    def test_rejects_corrupt_forms(self, form, tense):
        assert _is_usable_form(form, "kalbė́ti", tense, _CORRUPT_89) is False

    @pytest.mark.parametrize(
        "form,tense",
        [
            ("kal̃ba", "indicative_present"),
            ("kal̃bame", "indicative_present"),
            ("kalbù", "indicative_present"),
            ("kalbė́tum", "conditional"),
            ("kalbė́tų", "conditional"),
            ("kalbė́tume / kalbė́tumėme", "conditional"),   # slash alternates
            ("kalbė́čiau", "conditional"),
        ],
    )
    def test_accepts_clean_forms(self, form, tense):
        assert _is_usable_form(form, "kalbė́ti", tense, _CLEAN_89) is True

    def test_accepts_tegu_imperative(self):
        conj = {"imperative": {"jis, ji, jie, jos": "tegu kal̃ba"}}
        assert _is_usable_form("tegu kal̃ba", "kalbė́ti", "imperative", conj) is True

    def test_accepts_reflexive_conditional(self):
        conj = {"conditional": {"tu": "kalbė́tumeisi"}}
        assert _is_usable_form("kalbė́tumeisi", "kalbė́tis", "conditional", conj) is True

    def test_accepts_buti_irregular_present(self):
        # bū́ti is suppletive and short; the stem check must not swallow it.
        conj = {"indicative_present": {"aš": "esù", "jis, ji, jie, jos": "yrà"}}
        assert _is_usable_form("esù", "bū́ti", "indicative_present", conj) is True
        assert _is_usable_form("yrà", "bū́ti", "indicative_present", conj) is True

    def test_rejects_form_duplicated_across_tenses(self):
        # A cell repeated in two tenses means a column failed to advance.
        conj = {
            "indicative_present": {"mes": "rãšėme"},
            "indicative_past_simple": {"mes": "rãšėme"},
        }
        assert _is_usable_form("rãšėme", "rašýti", "indicative_present", conj) is False


@pytest.fixture(scope="module")
def corrupt_verb():
    """Insert kalbė́ti carrying the payload issue #153 reported; clean up afterwards."""
    with Session(_db.engine) as s:
        v = Verb(
            number=9089,
            infinitive="kalbė́ti",
            present_3p="kalb̃ a",
            past_3p="kalbė́jo",
            translation_ru="говорить",
            is_reflexive=False,
            conjugations=json.dumps(_CORRUPT_89, ensure_ascii=False),
            case_governance="[]",
            prefix_forms="[]",
            non_conjugated="{}",
            programs="[]",
        )
        s.add(v)
        s.commit()
        vid = v.id
    yield
    with Session(_db.engine) as s:
        s.delete(s.get(Verb, vid))
        s.commit()


class TestTaskGeneration:
    def test_never_emits_a_corrupt_answer(self, corrupt_verb):
        """The reported symptom: "Правильно: kalb̃" must be unreachable."""
        with Session(_db.engine) as s:
            for tense in ("indicative_present", "indicative_past_simple", "conditional"):
                tasks = _generate_verb_conjugation_tasks(tense, 60, s, program_key=None)
                for task in tasks:
                    answer = task["answer"]
                    assert _base_letters(answer), f"{tense}: marks-only answer {answer!r}"
                    assert answer != "kalb̃", f"{tense}: served the #153 defect"
                    assert len(_base_letters(answer)) >= len(_verb_stem(task["verb_infinitive"])), \
                        f"{tense}: answer {answer!r} shorter than its stem"

    def test_clean_form_still_strips_known_artifacts(self):
        assert _clean_form("yrà,") == "yrà"
        assert _clean_form("быть, являться,") == "быть, являться"
        assert _clean_form(None) == ""
