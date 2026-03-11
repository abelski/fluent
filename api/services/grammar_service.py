# Grammar lesson content service.
#
# Three task types are supported:
#   "declension" — user must type the correct case form of a given word (basic level)
#   "sentence"   — user must fill in a blank in a real Lithuanian sentence (advanced/practice)
#
# Content data (WORDS, LESSON_CONFIG, SENTENCES, CASE_RULES) is imported from the data/grammar/
# package so this service contains only generation logic, not raw data.

import re
import random

from data.grammar.words import WORDS
from data.grammar.lessons import LESSON_CONFIG, CASE_INFO
from data.grammar.sentences import SENTENCES
from data.grammar.rules import CASE_RULES

# Precomputed mapping: stem → nominative singular form (stem + nominative ending).
# Used to annotate sentence tasks with the base form of the target word.
_STEM_TO_NOMINATIVE: dict[str, str] = {
    word[0]: word[0] + word[1] for word in WORDS
}


def _extract_stem(display: str) -> str:
    """Extract the word stem from a sentence display string like 'Laima mato brol___.'"""
    match = re.search(r'(\w+)___', display)
    return match.group(1) if match else ''


def get_lessons() -> list[dict]:
    """Return metadata for all lessons defined in LESSON_CONFIG.

    LESSON_CONFIG entries are tuples: (id, level, cases, task_count, title).
    Each lesson includes the grammar rules for its cases so the frontend can
    display hints without an extra API round-trip.
    """
    return [
        {
            "id": entry[0],
            "title": entry[4],
            "level": entry[1],
            "cases": entry[2],
            "task_count": entry[3],
            "rules": [CASE_RULES[c] for c in entry[2] if c in CASE_RULES],
        }
        for entry in LESSON_CONFIG
    ]


def _word_form(word_entry: list, case_idx: int) -> str | None:
    """Return full word form for given case index (1-14). Returns None for irregular (!) forms.

    word_entry layout: [stem, nom_ending, gen_ending, ..., ru_translation]
    The full form is constructed as stem + ending.
    """
    if case_idx < 1 or case_idx > 14:
        return None
    ending = word_entry[case_idx]
    if ending.startswith("!"):
        # Irregular forms are marked with '!' and excluded from generated tasks
        # because they don't follow the pattern being taught.
        return None
    return word_entry[0] + ending


def _word_nominative(word_entry: list) -> str:
    """Return the nominative singular form (index 0 + index 1 = stem + nom ending)."""
    return word_entry[0] + word_entry[1]


def _word_ru(word_entry: list) -> str:
    """Return the Russian translation stored at the last position in the word entry."""
    return word_entry[-1]


def _generate_declension_tasks(cases: list[int], count: int) -> list[dict]:
    """Generate declension fill-in tasks by randomly sampling WORDS for the given cases.

    The loop retries up to count*5 times to skip words with irregular forms (!),
    ensuring we always produce the requested number of valid tasks when possible.
    """
    pool = list(WORDS)
    random.shuffle(pool)
    tasks = []
    attempts = 0
    while len(tasks) < count and attempts < count * 5:
        attempts += 1
        word = pool[attempts % len(pool)]
        case_idx = random.choice(cases)
        form = _word_form(word, case_idx)
        if form is None:
            continue  # Skip irregular forms
        case_name, number = CASE_INFO.get(case_idx, ("", ""))
        tasks.append({
            "type": "declension",
            "prompt_lt": _word_nominative(word),  # shown to the student in Lithuanian
            "prompt_ru": _word_ru(word),           # Russian hint
            "case_name": case_name,
            "number": number,                      # singular / plural
            "answer": form,
        })
    return tasks


def _generate_sentence_tasks(cases: list[int], count: int) -> list[dict]:
    """Generate sentence gap-fill tasks from the SENTENCES data for given cases.

    Each task includes base_lt — the nominative form of the target word — derived
    by looking up the word stem in the WORDS list. Falls back to declension tasks
    if no sentences are defined for the requested cases.
    """
    # Build pool from all hardcoded sentences for requested cases.
    pool: list[tuple[str, str, str, str]] = []
    for case_idx in cases:
        pool.extend(SENTENCES.get(case_idx, []))

    if not pool:
        # Fallback to declension tasks if no sentences defined for these cases.
        return _generate_declension_tasks(cases, count)

    random.shuffle(pool)
    tasks = []
    for i in range(count):
        # Cycle through pool with modulo so count can exceed pool size
        display, answer, full_answer, translation_ru = pool[i % len(pool)]
        stem = _extract_stem(display)
        base_lt = _STEM_TO_NOMINATIVE.get(stem)  # None if stem not in WORDS
        tasks.append({
            "type": "sentence",
            "display": display,           # sentence with a blank to fill in
            "answer": answer,             # the word/ending that fills the blank
            "full_answer": full_answer,   # the complete sentence for showing after answer
            "translation_ru": translation_ru,
            "base_lt": base_lt,           # nominative form (base form) for puzzle display
        })
    return tasks


def get_lesson_tasks(lesson_id: int) -> list[dict] | None:
    """Look up a lesson by ID and generate its tasks.

    Returns None if the lesson_id is not found — the router converts this to 404.
    Level determines task type:
      'basic'    → declension tasks (with grammar rule shown on frontend)
      'advanced' → sentence puzzle tasks (with collapsible grammar rule)
      'practice' → sentence puzzle tasks (no grammar rule shown)
    """
    config = next((e for e in LESSON_CONFIG if e[0] == lesson_id), None)
    if config is None:
        return None
    num, level, cases, task_count, title = config
    if level == "basic":
        return _generate_declension_tasks(cases, task_count)
    else:
        # Both 'advanced' and 'practice' use sentence-style puzzle tasks.
        return _generate_sentence_tasks(cases, task_count)
