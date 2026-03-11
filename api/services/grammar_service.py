# Grammar lesson content service.
#
# Two task types are supported:
#   "declension" — user must type the correct case form of a given word
#   "sentence"   — user must fill in a blank in a real Lithuanian sentence
#
# Content data (WORDS, LESSON_CONFIG, SENTENCES) is imported from the data/grammar/
# package so this service contains only generation logic, not raw data.

import random

from data.grammar.words import WORDS
from data.grammar.lessons import LESSON_CONFIG, CASE_INFO
from data.grammar.sentences import SENTENCES


def get_lessons() -> list[dict]:
    """Return metadata for all lessons defined in LESSON_CONFIG.

    LESSON_CONFIG entries are tuples: (id, level, cases, task_count, title).
    The tuple format is used in the data file for compactness.
    """
    return [
        {
            "id": entry[0],
            "title": entry[4],
            "level": entry[1],
            "cases": entry[2],
            "task_count": entry[3],
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

    Falls back to declension tasks if no sentences are defined for the requested cases,
    so lessons always return something even when sentence data is incomplete.
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
        tasks.append({
            "type": "sentence",
            "display": display,           # sentence with a blank to fill in
            "answer": answer,             # the word that fills the blank
            "full_answer": full_answer,   # the complete sentence for showing after answer
            "translation_ru": translation_ru,
        })
    return tasks


def get_lesson_tasks(lesson_id: int) -> list[dict] | None:
    """Look up a lesson by ID and generate its tasks.

    Returns None if the lesson_id is not found — the router converts this to 404.
    Lesson level determines task type: 'practice' → sentences, otherwise → declension.
    """
    config = next((e for e in LESSON_CONFIG if e[0] == lesson_id), None)
    if config is None:
        return None
    num, level, cases, task_count, title = config
    if level == "practice":
        return _generate_sentence_tasks(cases, task_count)
    else:
        return _generate_declension_tasks(cases, task_count)
