# Issue #156 — grammar sentence "Mama eina su dukt___." was graded against the wrong
# ending ('eria') while displaying an equally wrong "correct answer" ('dukteri'); the
# correct instrumental singular of duktė is "dukterimi" (ending 'erimi').
#
# The bad ending was copied from data/grammar/words.txt (repo-authoritative — used by
# _generate_declension_tasks and _FORM_TO_NOMINATIVE), so fixing only the DB row would
# leave declension tasks still teaching "dukteria"/"seseria". This suite pins:
#   1. words.txt now derives the correct instrumental singular for dukt/ses.
#   2. words.txt stays structurally well-formed (16 tab-separated fields per row).
#   3. the read-time invariant guard (_sentence_invariant_holds, applied inside
#      _generate_sentence_tasks) means a mismatched DB row can never be served, even
#      if one is inserted directly.

from pathlib import Path

from sqlmodel import Session

import database as _db
from models import GrammarSentence
from grammar_service import (
    WORDS,
    _generate_sentence_tasks,
    _sentence_invariant_holds,
    _word_form,
)

_WORDS_PATH = Path(__file__).resolve().parent.parent / "data/grammar/words.txt"


def _word_row(stem: str) -> list:
    for w in WORDS:
        if w[0] == stem:
            return w
    raise AssertionError(f"no words.txt row for stem {stem!r}")


class TestWordsTxtInstrumental:
    def test_dukt_instrumental_singular_is_dukterimi(self):
        assert _word_form(_word_row("dukt"), 5) == "dukterimi"

    def test_ses_instrumental_singular_is_seserimi(self):
        assert _word_form(_word_row("ses"), 5) == "seserimi"


class TestWordsTxtStructure:
    def test_every_row_has_16_tab_separated_fields(self):
        bad_lines: list[tuple[int, int]] = []
        for lineno, line in enumerate(_WORDS_PATH.read_text(encoding="utf-8").splitlines(), start=1):
            stripped = line.strip()
            if not stripped or stripped.startswith("#"):
                continue
            fields = line.rstrip("\n").split("\t")
            if len(fields) != 16:
                bad_lines.append((lineno, len(fields)))
        assert bad_lines == [], f"rows with wrong field count (line, count): {bad_lines}"


class TestSentenceInvariantGuard:
    def test_helper_rejects_the_reported_row_shape(self):
        assert _sentence_invariant_holds(
            "Mama eina su dukt___.", "eria", "dukteri"
        ) is False

    def test_helper_accepts_the_fixed_row_shape(self):
        assert _sentence_invariant_holds(
            "Mama eina su dukt___.", "erimi", "dukterimi"
        ) is True

    def test_mismatched_row_is_never_emitted_by_generate_sentence_tasks(self):
        """A GrammarSentence carrying the exact #156 defect must never reach a student."""
        case_index = 9156  # unused sentinel case so this test can't collide with real lesson data
        with Session(_db.engine) as s:
            bad = GrammarSentence(
                case_index=case_index,
                display="Mama eina su dukt___.",
                answer_ending="eria",
                full_word="dukteri",
                russian="Мама идёт с дочерью.",
                archived=False,
                use_in_basic=True,
                use_in_advanced=True,
                use_in_practice=True,
            )
            good = GrammarSentence(
                case_index=case_index,
                display="Mama eina su dukt___.",
                answer_ending="erimi",
                full_word="dukterimi",
                russian="Мама идёт с дочерью.",
                archived=False,
                use_in_basic=True,
                use_in_advanced=True,
                use_in_practice=True,
            )
            s.add(bad)
            s.add(good)
            s.commit()
            bad_id, good_id = bad.id, good.id

            try:
                tasks = _generate_sentence_tasks([case_index], 40, s, level="advanced")
                for task in tasks:
                    if task["type"] != "sentence":
                        continue
                    assert task["full_answer"] != "dukteri", "served the #156 defect (dukteri)"
                    assert task["full_answer"] != "dukteria", "served the #156 defect (dukteria)"
                    if task["answer"] == "eria" and task["display"].startswith("Mama eina su dukt"):
                        raise AssertionError("served the corrupt eria/dukteri row")
                # the clean row must still be reachable — proves this is a filter, not a
                # blanket exclusion of the whole case/stem.
                assert any(
                    t["full_answer"] == "dukterimi" and t["answer"] == "erimi"
                    for t in tasks
                    if t["type"] == "sentence"
                )
            finally:
                s.delete(s.get(GrammarSentence, bad_id))
                s.delete(s.get(GrammarSentence, good_id))
                s.commit()
