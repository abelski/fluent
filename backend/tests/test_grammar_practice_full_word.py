# Plan #8 — grammar practice-level: type the full word, not just the ending.
#
# At `level == "practice"`, `_generate_sentence_tasks` must strip the captured stem
# span out of `display` (so the blank stands for the whole word) and grade against
# `stem + answer_ending` (the full inflected word) rather than `answer_ending` alone.
# `basic`/`advanced` levels must stay pixel-for-pixel unchanged (ending-only), and the
# cases 17-19 multi-word ordinal exception (a non-inflecting numeral prefix stored in
# `full_word` but never part of the captured stem) must grade only the inflecting word,
# not the whole `full_word` phrase — see documentation/grammar-sentence-data-integrity.md.

from sqlmodel import Session

import database as _db
from models import GrammarSentence
from grammar_service import _generate_sentence_tasks

# Sentinel case_index values unused by real lesson data or other test files
# (test_issue_156_dukterimi_instrumental.py already uses 9156/9157).
_SIMPLE_CASE_INDEX = 9801
_ORDINAL_CASE_INDEX = 9802


def _insert_sentence(session: Session, **kwargs) -> GrammarSentence:
    row = GrammarSentence(
        archived=False,
        use_in_basic=True,
        use_in_advanced=True,
        use_in_practice=True,
        **kwargs,
    )
    session.add(row)
    session.commit()
    return row


class TestPracticeLevelSimpleStem:
    """(a) simple stem row at level='practice' → stem stripped, full word required."""

    def test_practice_level_strips_stem_and_requires_full_word(self):
        with Session(_db.engine) as s:
            row = _insert_sentence(
                s,
                case_index=_SIMPLE_CASE_INDEX,
                display="Laima mato brol___.",
                answer_ending="į",
                full_word="brolį",
                russian="Лайма видит брата.",
            )
            row_id = row.id
            try:
                tasks = _generate_sentence_tasks([_SIMPLE_CASE_INDEX], 20, s, level="practice")
                sentence_tasks = [t for t in tasks if t["type"] == "sentence"]
                assert sentence_tasks, "expected at least one sentence task"
                for task in sentence_tasks:
                    assert "brol" not in task["display"], (
                        f"stem still present in practice-level display: {task['display']!r}"
                    )
                    assert task["display"] == "Laima mato ___."
                    assert task["answer"] == "brolį"
                    assert task["full_answer"] == "brolį"
            finally:
                s.delete(s.get(GrammarSentence, row_id))
                s.commit()


class TestAdvancedLevelUnchanged:
    """(b) the same row at level='advanced' → regression guard, ending-only shape."""

    def test_advanced_level_still_shows_stem_and_grades_ending_only(self):
        with Session(_db.engine) as s:
            row = _insert_sentence(
                s,
                case_index=_SIMPLE_CASE_INDEX,
                display="Laima mato brol___.",
                answer_ending="į",
                full_word="brolį",
                russian="Лайма видит брата.",
            )
            row_id = row.id
            try:
                tasks = _generate_sentence_tasks([_SIMPLE_CASE_INDEX], 20, s, level="advanced")
                sentence_tasks = [t for t in tasks if t["type"] == "sentence"]
                assert sentence_tasks, "expected at least one sentence task"
                for task in sentence_tasks:
                    assert task["display"] == "Laima mato brol___."
                    assert task["answer"] == "į"
                    assert task["full_answer"] == "brolį"
            finally:
                s.delete(s.get(GrammarSentence, row_id))
                s.commit()


class TestPracticeLevelOrdinalException:
    """(c) cases 17-19-shaped multi-word row → grade only the inflecting word."""

    def test_practice_level_grades_only_inflecting_word_not_full_phrase(self):
        with Session(_db.engine) as s:
            row = _insert_sentence(
                s,
                case_index=_ORDINAL_CASE_INDEX,
                display="Važiuoju dvidešimt pirm___ autobusu.",
                answer_ending="u",
                full_word="dvidešimt pirmu",
                russian="Я еду двадцать первым автобусом.",
            )
            row_id = row.id
            try:
                tasks = _generate_sentence_tasks([_ORDINAL_CASE_INDEX], 20, s, level="practice")
                sentence_tasks = [t for t in tasks if t["type"] == "sentence"]
                assert sentence_tasks, "expected at least one sentence task"
                for task in sentence_tasks:
                    assert task["display"] == "Važiuoju dvidešimt ___ autobusu."
                    assert task["answer"] == "pirmu"
                    assert task["answer"] != "dvidešimt pirmu"
                    assert task["full_answer"] == "dvidešimt pirmu"
            finally:
                s.delete(s.get(GrammarSentence, row_id))
                s.commit()
