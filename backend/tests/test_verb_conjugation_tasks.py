# Issue #150 — verb conjugation answers must not carry PDF-extraction artifacts.
#
# The `verb` table was seeded from a PDF whose text layer emitted stray punctuation.
# Verb 24 (bū́ti) had every `indicative_present` form ending in a comma, so the
# correct answer rendered as "yrà," and typing "yra" was graded wrong.
#
# The production data is fixed, but temp_files/verbs_extracted.json is gitignored and
# still corrupt — re-running seed_verbs_db.py would reintroduce it. These tests pin the
# server-side sanitiser that makes the task builder resilient to it.

import json

import pytest
from sqlmodel import Session

import database as _db
from models import Verb
from grammar_service import _clean_form, _generate_verb_conjugation_tasks

# conftest's create_all ran before Verb was imported, so its table does not exist yet.
Verb.__table__.create(_db.engine, checkfirst=True)

# The exact corrupt payload that was in production for verb 24.
#   "esi̇,̀" — comma sits *before* the combining grave, plus a stray dot above.
_CORRUPT_PRESENT = {
    "aš": "esù,",
    "tu": "esi̇,̀",
    "jis, ji, jie, jos": "yrà,",
    "mes": "ẽsame,",
    "jūs": "ẽsate,",
}


@pytest.fixture(scope="module")
def buti_verb():
    """Insert bū́ti carrying the original corrupt payload; remove it afterwards."""
    with Session(_db.engine) as s:
        v = Verb(
            number=9024,
            infinitive="bū́ti",
            present_3p="yrà,",
            past_3p="bùvo",
            translation_ru="быть, являться,",
            conjugations=json.dumps({"indicative_present": _CORRUPT_PRESENT}, ensure_ascii=False),
            programs=json.dumps(["sekmes"]),
        )
        s.add(v)
        s.commit()
        vid = v.id
    yield vid
    with Session(_db.engine) as s:
        s.delete(s.get(Verb, vid))
        s.commit()


class TestCleanForm:
    def test_strips_trailing_comma(self):
        assert _clean_form("yrà,") == "yrà"

    def test_strips_comma_sitting_before_a_combining_accent(self):
        # "esi" + U+0307 + "," + U+0300  ->  "esi" + U+0300
        assert _clean_form("esi̇,̀") == "esì"

    def test_strips_stray_combining_dot_above_after_i(self):
        assert _clean_form("atsakai̇") == "atsakai"

    def test_preserves_inner_commas(self):
        assert _clean_form("быть, являться,") == "быть, являться"

    def test_leaves_clean_input_untouched(self):
        assert _clean_form("yrà") == "yrà"

    def test_preserves_slash_alternates(self):
        # isAnswerMatch splits on "/" — the sanitiser must not disturb these.
        assert _clean_form("kèptume / kèptumėme") == "kèptume / kèptumėme"

    @pytest.mark.parametrize("empty", [None, "", "   "])
    def test_handles_empty_input(self, empty):
        assert _clean_form(empty) == ""


class TestVerbConjugationTasks:
    def test_tasks_carry_no_extraction_artifacts(self, buti_verb):
        with Session(_db.engine) as s:
            tasks = _generate_verb_conjugation_tasks(
                "indicative_present", 20, s, program_key=None
            )

        assert tasks, "expected the seeded verb to produce tasks"
        for t in tasks:
            assert "," not in t["answer"], f"answer still has a comma: {t['answer']!r}"
            assert "i̇" not in t["answer"], f"answer still has U+0307: {t['answer']!r}"
            assert not t["translation_ru"].rstrip().endswith(","), t["translation_ru"]

    def test_yra_is_served_without_the_reported_comma(self, buti_verb):
        """The literal defect from the report: 'yrà,' must reach the client as 'yrà'."""
        with Session(_db.engine) as s:
            tasks = _generate_verb_conjugation_tasks(
                "indicative_present", 60, s, program_key=None
            )

        third_person = [t for t in tasks if t["person_label"].startswith("jis")]
        assert third_person, "3rd-person form was never drawn — cannot assert on it"
        for t in third_person:
            assert t["answer"] == "yrà"

    def test_tu_form_is_gradeable_after_cleaning(self, buti_verb):
        """A comma-only fix would leave 'esi̇' (stray U+0307) and still fail grading."""
        with Session(_db.engine) as s:
            tasks = _generate_verb_conjugation_tasks(
                "indicative_present", 60, s, program_key=None
            )

        tu = [t for t in tasks if t["person_label"] == "tu"]
        assert tu, "'tu' form was never drawn — cannot assert on it"
        for t in tu:
            assert t["answer"] == "esì"

    def test_translation_keeps_its_inner_comma(self, buti_verb):
        with Session(_db.engine) as s:
            tasks = _generate_verb_conjugation_tasks(
                "indicative_present", 20, s, program_key=None
            )

        assert all(t["translation_ru"] == "быть, являться" for t in tasks)
