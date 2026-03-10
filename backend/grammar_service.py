import random

from data.grammar.words import WORDS
from data.grammar.lessons import LESSON_CONFIG, CASE_INFO
from data.grammar.sentences import SENTENCE_TEMPLATES


def get_lessons() -> list[dict]:
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
    """Return full word form for given case index (1-14). Returns None for irregular (!) forms."""
    if case_idx < 1 or case_idx > 14:
        return None
    ending = word_entry[case_idx]
    if ending.startswith("!"):
        return None
    return word_entry[0] + ending


def _word_nominative(word_entry: list) -> str:
    return word_entry[0] + word_entry[1]


def _word_ru(word_entry: list) -> str:
    return word_entry[-1]


def _generate_declension_tasks(cases: list[int], count: int) -> list[dict]:
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
            continue
        case_name, number = CASE_INFO.get(case_idx, ("", ""))
        tasks.append({
            "type": "declension",
            "prompt_lt": _word_nominative(word),
            "prompt_ru": _word_ru(word),
            "case_name": case_name,
            "number": number,
            "answer": form,
        })
    return tasks


def _generate_sentence_tasks(cases: list[int], count: int) -> list[dict]:
    pool = list(WORDS)
    random.shuffle(pool)
    tasks = []
    attempts = 0
    while len(tasks) < count and attempts < count * 10:
        attempts += 1
        word = pool[attempts % len(pool)]
        case_idx = random.choice(cases)
        form = _word_form(word, case_idx)
        if form is None:
            continue
        templates = SENTENCE_TEMPLATES.get(case_idx)
        if not templates:
            case_name, number = CASE_INFO.get(case_idx, ("", ""))
            tasks.append({
                "type": "declension",
                "prompt_lt": _word_nominative(word),
                "prompt_ru": _word_ru(word),
                "case_name": case_name,
                "number": number,
                "answer": form,
            })
            continue

        lt_tmpl, ru_tmpl = random.choice(templates)
        stem = word[0]
        ending = word[case_idx]
        ru = _word_ru(word)

        display = lt_tmpl.replace("{blank}", stem)
        translation = ru_tmpl.replace("{ru}", ru)

        tasks.append({
            "type": "sentence",
            "display": display,
            "answer": ending,
            "full_answer": form,
            "translation_ru": translation,
        })
    return tasks


def get_lesson_tasks(lesson_id: int) -> list[dict] | None:
    config = next((e for e in LESSON_CONFIG if e[0] == lesson_id), None)
    if config is None:
        return None
    num, level, cases, task_count, title = config
    if level == "practice":
        return _generate_sentence_tasks(cases, task_count)
    else:
        return _generate_declension_tasks(cases, task_count)
