# Grammar lesson content service.
#
# Task types:
#   "declension"       — type the correct case form of a noun
#   "sentence"         — fill-in-the-blank in a Lithuanian sentence
#   "verb_conjugation" — type the correct conjugated form of a verb
#   "verb_case"        — type the case question word a verb governs
#
# Noun data loaded from data/grammar/words.txt and DB.
# Verb data loaded from the `verb` DB table (seeded by seed_verbs_db.py).

import json
import re
import random
from pathlib import Path

from sqlmodel import Session, select

from data.grammar.lessons import LESSON_CONFIG, CASE_INFO
from models import GrammarSentence, GrammarCaseRule, Article, Verb

# ── Verb lesson config ────────────────────────────────────────────────────────
import json as _json
_VERB_LESSONS_PATH = Path(__file__).parent / "data/grammar/verb_lessons.json"
_verb_lessons_data = _json.loads(_VERB_LESSONS_PATH.read_text(encoding="utf-8"))
VERB_LESSON_CONFIG: dict[int, tuple] = {
    row[0]: tuple(row) for row in _verb_lessons_data["verb_lessons"]
}
_TENSE_HINTS: dict[str, dict] = _verb_lessons_data.get("tense_hints", {})
# Tense keys that exist for each verb (subset of all possible tenses)
# All possible person labels shown to the student
_VERB_PERSONS = ["aš", "tu", "jis", "ji", "jie", "jos", "mes", "jūs"]

# Map from display pronoun → conjugation table key
_PERSON_KEY = {
    "aš": "aš",
    "tu": "tu",
    "jis": "jis, ji, jie, jos",
    "ji":  "jis, ji, jie, jos",
    "jie": "jis, ji, jie, jos",
    "jos": "jis, ji, jie, jos",
    "mes": "mes",
    "jūs": "jūs",
}
_TENSE_LABELS = {
    "indicative_present":       "Настоящее время",
    "indicative_past_simple":   "Прошедшее картинное",
    "indicative_past_habitual": "Прошедшее многократное",
    "indicative_future":        "Будущее время",
    "conditional":              "Условное наклонение",
    "imperative":               "Повелительное наклонение",
}

# Load noun declension table from content file.
# Each row: [stem, sg1..sg7, pl1..pl7, ru_translation] (17 fields total)
_WORDS_PATH = Path(__file__).parent / "data/grammar/words.txt"
WORDS = [
    line.strip().split("\t")
    for line in _WORDS_PATH.read_text(encoding="utf-8").splitlines()
    if line.strip() and not line.startswith("#")
]

# Precomputed mapping: stem → nominative singular form (stem + nominative ending).
# Used as a fallback when the full-word lookup is ambiguous.
_STEM_TO_NOMINATIVE: dict[str, str] = {w[0]: w[0] + w[1] for w in WORDS}

# Mapping from any full word form → its nominative singular.
# When two different words share the same form the value is set to None (ambiguous).
# This is used in sentence tasks so that words with a shared stem (e.g. draugas/draugė)
# are resolved correctly from the stored full_word rather than just the stem.
_FORM_TO_NOMINATIVE: dict[str, str | None] = {}
for _w in WORDS:
    _nom = _w[0] + _w[1]
    for _col in range(1, 15):  # columns 1-14 cover all singular and plural cases
        _ending = _w[_col]
        if _ending.startswith("!"):
            continue
        _form = _w[0] + _ending
        if _form in _FORM_TO_NOMINATIVE:
            if _FORM_TO_NOMINATIVE[_form] != _nom:
                _FORM_TO_NOMINATIVE[_form] = None  # ambiguous — two words share this form
        else:
            _FORM_TO_NOMINATIVE[_form] = _nom

# Stems of place/location nouns — used to restrict Vietininkas (locative) basic
# declension tasks so every prompt makes semantic sense as a location.
_PLACE_STEMS: frozenset[str] = frozenset([
    "nam",          # дом
    "kel",          # дорога
    "kambar",       # комната
    "gatv",         # улица
    "pil",          # замок
    "centr",        # центр
    "sod",          # сад
    "rajon",        # район
    "universitet",  # университет
    "sodyb",        # усадьба
    "katedr",       # кафедральный собор
    "bažnyč",       # церковь
    "aikšt",        # площадь
    "rotuš",        # ратуша
    "stot",         # вокзал
    "muziej",       # музей
    "turg",         # рынок
    "švytur",       # маяк
])

# Cases that semantically require place/location nouns (locative singular/plural).
_LOCATION_CASES: frozenset[int] = frozenset([6, 13])


def _extract_stem(display: str) -> str:
    """Extract the word stem from a sentence display string like 'Laima mato brol___.'"""
    match = re.search(r'(\w+)___', display)
    return match.group(1) if match else ''


def get_lessons(session: Session, is_admin: bool = False) -> list[dict]:
    """Return metadata for all lessons defined in LESSON_CONFIG.

    LESSON_CONFIG entries are tuples: (id, level, cases, task_count, title).
    Each lesson includes the grammar rules for its cases so the frontend can
    display hints without an extra API round-trip.
    Rules are loaded from the grammar_case_rule DB table.
    Non-admins only receive lessons where all case indices are published.
    Admins receive all lessons with an is_published field on each.
    """
    case_rules = session.exec(select(GrammarCaseRule)).all()
    # published cases visible to all; testing+draft visible to admins
    published_cases: set[int] = {r.case_index for r in case_rules if r.status == "published"}
    admin_visible_cases: set[int] = {r.case_index for r in case_rules if r.status in ("published", "testing", "draft")}
    case_status: dict[int, str] = {r.case_index: r.status for r in case_rules}

    # Load article titles for any linked slugs (one query, keyed by slug)
    linked_slugs = {r.article_slug for r in case_rules if r.article_slug}
    article_titles: dict[str, tuple[str, str]] = {}
    if linked_slugs:
        articles = session.exec(select(Article).where(Article.slug.in_(linked_slugs))).all()
        article_titles = {a.slug: (a.title_ru, a.title_en) for a in articles}

    db_rules = {
        row.case_index: {
            "question": row.question,
            "name_ru": row.name_ru,
            "usage": row.usage,
            "endings_sg": row.endings_sg,
            "endings_pl": row.endings_pl,
            "transform": row.transform,
            "article_slug": row.article_slug,
            "article_title_ru": article_titles.get(row.article_slug, (None, None))[0] if row.article_slug else None,
            "article_title_en": article_titles.get(row.article_slug, (None, None))[1] if row.article_slug else None,
        }
        for row in case_rules
    }
    result = []
    for entry in LESSON_CONFIG:
        lesson_cases: list[int] = entry[2]
        lesson_published = all(c in published_cases for c in lesson_cases)
        lesson_admin_visible = all(c in admin_visible_cases for c in lesson_cases)
        if not is_admin and not lesson_published:
            continue
        if is_admin and not lesson_admin_visible:
            continue
        lesson: dict = {
            "id": entry[0],
            "title": entry[4],
            "level": entry[1],
            "cases": lesson_cases,
            "task_count": entry[3],
            "rules": [db_rules[c] for c in lesson_cases if c in db_rules],
        }
        if is_admin:
            # Show the "worst" status among lesson cases (draft < testing < published)
            statuses = [case_status.get(c, "testing") for c in lesson_cases]
            priority = {"draft": 0, "testing": 1, "published": 2}
            lesson["status"] = min(statuses, key=lambda s: priority.get(s, 1))
        result.append(lesson)
    return result


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
    For locative cases (6, 13) only place/location nouns are used so that every
    prompt makes semantic sense (e.g. "в доме" not "в бутерброде").
    """
    if _LOCATION_CASES.issuperset(cases):
        pool = [w for w in WORDS if w[0] in _PLACE_STEMS]
    else:
        pool = list(WORDS)
    random.shuffle(pool)
    tasks = []
    attempts = 0
    while len(tasks) < count and attempts < count * 5:
        word = pool[attempts % len(pool)]
        attempts += 1
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


def _generate_sentence_tasks(cases: list[int], count: int, session: Session, level: str = "advanced") -> list[dict]:
    """Generate sentence gap-fill tasks from the grammar_sentence DB table for given cases.

    Filters by the use_in_<level> flag so admins can control which sentences
    appear in each lesson type. Falls back to declension tasks if no matching
    sentences are found for the requested cases.
    """
    level_filter = {
        "basic":    GrammarSentence.use_in_basic == True,    # noqa: E712
        "advanced": GrammarSentence.use_in_advanced == True,  # noqa: E712
        "practice": GrammarSentence.use_in_practice == True,  # noqa: E712
    }.get(level, GrammarSentence.use_in_advanced == True)    # noqa: E712

    rows = session.exec(
        select(GrammarSentence).where(
            GrammarSentence.case_index.in_(cases),
            GrammarSentence.archived == False,  # noqa: E712
            level_filter,
        )
    ).all()

    if not rows:
        # Fallback to declension tasks if no sentences in DB for these cases.
        return _generate_declension_tasks(cases, count)

    pool = list(rows)
    random.shuffle(pool)
    tasks = []
    for i in range(count):
        row = pool[i % len(pool)]
        stem = _extract_stem(row.display)
        # Prefer full-word lookup: handles shared-stem nouns (e.g. draugas vs draugė)
        # where stem alone is ambiguous. Fall back to stem lookup if unresolved.
        base_lt = _FORM_TO_NOMINATIVE.get(row.full_word) or _STEM_TO_NOMINATIVE.get(stem)
        tasks.append({
            "type": "sentence",
            "display": row.display,
            "answer": row.answer_ending,
            "full_answer": row.full_word,
            "translation_ru": row.russian,
            "base_lt": base_lt,
        })
    return tasks


def get_lesson_tasks(lesson_id: int, session: Session) -> list[dict] | None:
    """Look up a lesson by ID and generate its tasks.

    Returns None if the lesson_id is not found — the router converts this to 404.
    Level determines task type:
      'basic'    → sentence puzzle tasks (grammar rule always visible on frontend)
      'advanced' → sentence puzzle tasks (with collapsible grammar rule)
      'practice' → sentence puzzle tasks (no grammar rule shown)
    All levels use grammar_sentence rows. Falls back to declension tasks if no
    sentences exist for the requested cases.
    """
    config = next((e for e in LESSON_CONFIG if e[0] == lesson_id), None)
    if config is None:
        return None
    num, level, cases, task_count, title = config
    return _generate_sentence_tasks(cases, task_count, session, level)


# ── Verb lesson task generators ───────────────────────────────────────────────

def get_verb_lessons(session: Session, program_type: str = "verbs") -> list[dict]:
    """Return verb lesson metadata list for a given program type.

    program_type='verbs'      → conjugation lessons (IDs 200-299)
    program_type='verb_cases' → case governance lessons (IDs 300-399)
    """
    id_filters = {
        "verbs": lambda lid: 200 <= lid < 300,
        "verb_cases": lambda lid: 300 <= lid < 400,
    }
    filter_fn = id_filters.get(program_type, lambda lid: 200 <= lid < 300)
    return [
        {
            "id": row[0],
            "level": row[1],
            "tense_key": row[2],
            "task_count": row[3],
            "title": row[4],
            "hint": _TENSE_HINTS.get(row[2]),
        }
        for lid, row in VERB_LESSON_CONFIG.items()
        if filter_fn(lid)
    ]


def get_verb_lesson_tasks(lesson_id: int, session: Session) -> list[dict] | None:
    """Generate tasks for a verb lesson.

    Returns None if lesson_id is not in VERB_LESSON_CONFIG.
    Dispatches to conjugation or case-governance generator based on tense_key.
    """
    config = VERB_LESSON_CONFIG.get(lesson_id)
    if config is None:
        return None
    _lid, _level, tense_key, task_count, _title = config

    if tense_key == "case_governance":
        return _generate_verb_case_tasks(task_count, session)
    return _generate_verb_conjugation_tasks(tense_key, task_count, session)


def _generate_verb_conjugation_tasks(
    tense_key: str, count: int, session: Session, program_key: str | None = "sekmes"
) -> list[dict]:
    """Pick random verbs from DB, random person, return verb_conjugation tasks.

    program_key: if set, restricts to verbs tagged with that vocabulary program.
    Falls back to all verbs if no tagged verbs have data for this tense.
    """
    all_verbs = session.exec(select(Verb)).all()

    if program_key:
        pool = [v for v in all_verbs if program_key in json.loads(v.programs)]
    else:
        pool = list(all_verbs)

    # Filter to verbs that have data for this tense
    eligible = [v for v in pool if json.loads(v.conjugations).get(tense_key)]

    # Fall back to all verbs if program filter yields nothing
    if not eligible and program_key:
        eligible = [v for v in all_verbs if json.loads(v.conjugations).get(tense_key)]
    if not eligible:
        return []

    tense_label = _TENSE_LABELS.get(tense_key, tense_key)
    tasks: list[dict] = []
    attempts = 0

    while len(tasks) < count and attempts < count * 10:
        attempts += 1
        verb = random.choice(eligible)
        conj = json.loads(verb.conjugations).get(tense_key, {})
        if not conj:
            continue
        person = random.choice(_VERB_PERSONS)
        form = conj.get(_PERSON_KEY.get(person, person))
        if not form:
            continue
        # Skip imperative aš (no form)
        tasks.append({
            "type": "verb_conjugation",
            "verb_infinitive": verb.infinitive,
            "translation_ru": verb.translation_ru,
            "tense_label": tense_label,
            "person_label": person,
            "answer": form,
        })

    return tasks


def _generate_verb_case_tasks(count: int, session: Session) -> list[dict]:
    """Pick random verbs with case governance data, return verb_case tasks."""
    verbs = session.exec(select(Verb)).all()
    eligible = [
        v for v in verbs
        if json.loads(v.case_governance)
    ]
    if not eligible:
        return []

    tasks: list[dict] = []
    attempts = 0

    while len(tasks) < count and attempts < count * 10:
        attempts += 1
        verb = random.choice(eligible)
        governance = json.loads(verb.case_governance)
        if not governance:
            continue
        entry = random.choice(governance)
        sentences = entry.get("sentences", [])
        if not sentences:
            continue
        sent = random.choice(sentences)
        lt_sent = sent.get("lt", "")
        ru_sent = sent.get("ru", "")
        if not lt_sent or not ru_sent:
            continue
        tasks.append({
            "type": "verb_case",
            "verb_infinitive": verb.infinitive,
            "translation_ru": verb.translation_ru,
            "example_lt": lt_sent,
            "example_ru": ru_sent,
            "answer": entry["question"],
        })

    return tasks
