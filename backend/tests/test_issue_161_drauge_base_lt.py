# Issue #161 — the "от: draugė" dictionary-form hint above a grammar sentence task was
# shown for a *masculine* vocative sentence ("Labas, draug___!" → drauge, meaning
# draugas), because it's linguistically ambiguous: Lithuanian's vocative rule
# (-as→-e, -ė→-e) makes masculine "draugas" and feminine "draugė" produce the
# identical inflected form "drauge".
#
# `_generate_sentence_tasks` computes the hint as
# `_FORM_TO_NOMINATIVE.get(row.full_word) or _STEM_TO_NOMINATIVE.get(stem)`.
# `_FORM_TO_NOMINATIVE["drauge"]` was already correctly None (issue #25 fixed that
# lookup once already), but the stem-level fallback, `_STEM_TO_NOMINATIVE`, was a
# plain last-write-wins dict comprehension over data/grammar/words.txt — and "draug"
# is the only duplicated stem in that file (draugas then draugė), so
# `_STEM_TO_NOMINATIVE["draug"]` always resolved to "draugė" regardless of which
# row was being served. This suite pins that both dicts now agree the hint must be
# hidden (None) rather than guessed, for both genders' rows.
#
# See documentation/grammar-sentence-data-integrity.md for the full writeup.

from sqlmodel import Session

import database as _db
from models import GrammarSentence
from grammar_service import _generate_sentence_tasks, _FORM_TO_NOMINATIVE, _STEM_TO_NOMINATIVE

# Unused sentinel case so this test can't collide with real lesson data
# (see test_issue_156_dukterimi_instrumental.py:71, test_grammar_practice_full_word.py:19-20
# for the same convention with different sentinel values).
_CASE_INDEX = 9161


class TestFormAndStemDictsAgreeDraugeIsAmbiguous:
    """Both module-level lookup dicts must already treat "drauge"/"draug" as ambiguous."""

    def test_form_to_nominative_drauge_is_none(self):
        assert _FORM_TO_NOMINATIVE.get("drauge") is None

    def test_stem_to_nominative_draug_is_none(self):
        assert _STEM_TO_NOMINATIVE.get("draug") is None


class TestBaseLtHiddenForBothGenders:
    """Two sentinel rows sharing full_word='drauge' with opposite genders must both
    get base_lt=None — neither the masculine nor the feminine row should show a
    guessed dictionary-form hint."""

    def test_base_lt_is_none_for_both_masculine_and_feminine_rows(self):
        with Session(_db.engine) as s:
            masculine = GrammarSentence(
                case_index=_CASE_INDEX,
                display="Labas, draug___!",
                answer_ending="e",
                full_word="drauge",
                russian="Привет, друг!",
                archived=False,
                use_in_basic=True,
                use_in_advanced=True,
                use_in_practice=True,
            )
            feminine = GrammarSentence(
                case_index=_CASE_INDEX,
                display="Sveiki, draug___!",
                answer_ending="e",
                full_word="drauge",
                russian="Привет, подруга!",
                archived=False,
                use_in_basic=True,
                use_in_advanced=True,
                use_in_practice=True,
            )
            s.add(masculine)
            s.add(feminine)
            s.commit()
            masculine_id, feminine_id = masculine.id, feminine.id

            try:
                tasks = _generate_sentence_tasks([_CASE_INDEX], 40, s, level="advanced")
                sentence_tasks = [t for t in tasks if t["type"] == "sentence"]
                assert sentence_tasks, "expected at least one sentence task"
                for task in sentence_tasks:
                    assert task["full_answer"] == "drauge"
                    assert task["base_lt"] is None, (
                        f"expected hidden base_lt for ambiguous 'drauge' row, got "
                        f"{task['base_lt']!r} for display {task['display']!r}"
                    )
                # both rows must actually be reachable — this proves the assertion above
                # covers both genders, not just one row winning the random pool sample.
                displays_seen = {t["display"] for t in sentence_tasks}
                assert "Labas, draug___!" in displays_seen
                assert "Sveiki, draug___!" in displays_seen
            finally:
                s.delete(s.get(GrammarSentence, masculine_id))
                s.delete(s.get(GrammarSentence, feminine_id))
                s.commit()
