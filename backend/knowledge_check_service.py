# Knowledge check + "Work on mistakes" (#62a) — see documentation/knowledge-check.md.
#
# A topic is one lesson family keyed by its *basic* lesson id ("g:<id>", "v:<id>") or a
# Practice category ("p:<category_id>"). The check is multiple choice only, so grading is
# an exact string compare on the server.

import math
import random
from typing import Callable, Optional

from sqlmodel import Session

import cache
from grammar_service import get_lessons, get_lesson_tasks, get_verb_lessons, get_verb_lesson_tasks
from models import User, UserGrammarProgram, UserPracticeCategoryEnrollment
from routers.grammar import _grammar_programs, _program_lesson_ids
from routers.practice import _load_exam, _practice_meta

VERB_TOPIC_LESSON_IDS = (200, 202, 204, 206, 208, 210)
CHECK_EXCLUDED_CATEGORY_IDS = {1}  # Конституция — a civics test, not language

NOUN_TOPICS = 5
VERB_TOPICS = 2
PRACTICE_TOPICS = 1
TASKS_PER_TOPIC = 2
GAP_TASK_COUNT = 10
GAP_MAX_TOPICS = 5


def _is_weak(correct: int, total: int) -> bool:
    """Inverse of the lesson pass gate `score/total > 0.75`."""
    return not (total > 0 and correct / total > 0.75)


# ── Practice task builders, keyed by test kind ────────────────────────────────

def _build_choice(exam: dict, count: int) -> list[dict]:
    """Ordinary multiple-choice test: `count` random questions sharing the test's passage."""
    passage = exam["test"].get("lesson_text_lt") or ""
    usable = []
    for q in exam["questions"]:
        options = [q[f"option_{k}"] for k in "abcd" if (q[f"option_{k}"] or "").strip()]
        answer = q.get(f"option_{q['correct_option']}") or ""
        if len(options) >= 2 and answer.strip():
            usable.append((q, options, answer))
    if len(usable) < count:
        return []
    return [
        {
            "type": "reading",
            "passage_lt": passage,
            "passage_title_ru": exam["test"].get("title_ru"),
            "passage_title_en": exam["test"].get("title_en"),
            "question_lt": q["question_lt"] or "",
            "question_ru": q["question_ru"] or "",
            "options": options,
            "answer": answer,
        }
        for q, options, answer in random.sample(usable, count)
    ]


PRACTICE_TASK_BUILDERS: dict[str, Callable[[dict, int], list[dict]]] = {
    "choice": _build_choice,
}


def _free_published_tests(category_id: int, session: Session) -> list:
    return [
        t for t in _practice_meta(session)["tests"]
        if t.category_id == category_id and t.status == "published" and not t.is_premium
    ]


def _exam(test_id: int, session: Session) -> Optional[dict]:
    return cache.get_or_load(
        ("practice_exam", test_id),
        lambda: _load_exam(test_id, session),
        tags={"practice_test", "practice_question"},
        store_if=lambda v: v is not None,
    )


def _practice_block(category_id: int, session: Session, count: int = TASKS_PER_TOPIC) -> list[dict]:
    """`count` tasks from one random free published test of the category, in builder order.
    Empty when no test of the category can supply them."""
    tests = _free_published_tests(category_id, session)
    random.shuffle(tests)
    for t in tests:
        builder = PRACTICE_TASK_BUILDERS.get(getattr(t, "kind", None) or "choice")
        if builder is None:
            continue  # a kind always ships with its builder; defensive skip
        exam = _exam(t.id, session)
        tasks = builder(exam, count) if exam else []
        if len(tasks) == count:
            return tasks
    return []


def practice_pool(session: Session) -> list:
    """Categories that join the check: at least one free published test, not excluded."""
    return [
        c for c in _practice_meta(session)["categories"]
        if c.id not in CHECK_EXCLUDED_CATEGORY_IDS and _free_published_tests(c.id, session)
    ]


# ── Topics ────────────────────────────────────────────────────────────────────

def _noun_topic_ids(session: Session) -> list[int]:
    return [l["id"] for l in get_lessons(session, is_admin=False) if l["level"] == "basic"]


def topic_titles(session: Session) -> dict[str, tuple[str, str]]:
    """topic key → (title_ru, title_en)."""
    titles: dict[str, tuple[str, str]] = {}
    for l in get_lessons(session, is_admin=False):
        if l["level"] == "basic":
            titles[f"g:{l['id']}"] = (l["title"], l["title"])
    for l in get_verb_lessons(session, program_type="verbs"):
        if l["id"] in VERB_TOPIC_LESSON_IDS:
            titles[f"v:{l['id']}"] = (l["title"], l["title_en"])
    for c in _practice_meta(session)["categories"]:
        titles[f"p:{c.id}"] = (c.name_ru, c.name_en or c.name_ru)
    return titles


def _grammar_tasks(key: str, session: Session) -> list[dict]:
    kind, lid = key.split(":")
    gen = get_verb_lesson_tasks if kind == "v" else get_lesson_tasks
    return gen(int(lid), session) or []


def _pick_grammar(keys: list[str], n: int, session: Session) -> list[dict]:
    """Up to `n` topics × TASKS_PER_TOPIC MC tasks; a topic yielding < 2 MC tasks is swapped
    for the next one of the same kind."""
    keys = list(keys)
    random.shuffle(keys)
    out: list[dict] = []
    picked = 0
    for key in keys:
        if picked == n:
            break
        mc = [t for t in _grammar_tasks(key, session) if t.get("options")]
        if len(mc) < TASKS_PER_TOPIC:
            continue
        out.extend({**t, "topic": key} for t in random.sample(mc, TASKS_PER_TOPIC))
        picked += 1
    return out


def _insert_blocks(pool: list[dict], blocks: list[list[dict]]) -> list[dict]:
    """Shuffle `pool`, then insert each block whole at a random position."""
    random.shuffle(pool)
    for block in blocks:
        at = random.randint(0, len(pool))
        pool[at:at] = block
    return pool


def build_check(session: Session) -> list[dict]:
    """16 tasks: 5 noun/numeral topics, 2 verb topics, 1 practice topic × 2 (Req 2)."""
    blocks: list[list[dict]] = []
    cats = practice_pool(session)
    random.shuffle(cats)
    for c in cats:
        if len(blocks) == PRACTICE_TOPICS:
            break
        block = _practice_block(c.id, session)
        if block:
            blocks.append([{**t, "topic": f"p:{c.id}"} for t in block])
    noun_n = NOUN_TOPICS + (PRACTICE_TOPICS - len(blocks))  # empty pool → 6th noun topic
    pool = _pick_grammar([f"g:{i}" for i in _noun_topic_ids(session)], noun_n, session)
    pool += _pick_grammar([f"v:{i}" for i in VERB_TOPIC_LESSON_IDS], VERB_TOPICS, session)
    return _insert_blocks(pool, blocks)


def grade(tasks: list[dict], responses: list[Optional[str]], session: Session) -> list[dict]:
    """Per-topic result in first-appearance order (Req 3–4)."""
    titles = topic_titles(session)
    rows: dict[str, dict] = {}
    for task, resp in zip(tasks, responses):
        key = task["topic"]
        if key not in rows:
            ru, en = titles.get(key, (key, key))
            rows[key] = {"topic": key, "title_ru": ru, "title_en": en, "correct": 0, "total": 0}
        rows[key]["total"] += 1
        if resp is not None and resp == task["answer"]:
            rows[key]["correct"] += 1
    for r in rows.values():
        r["weak"] = _is_weak(r["correct"], r["total"])
    return list(rows.values())


def weak_topics(result: list[dict]) -> list[dict]:
    """Weak topics, weakest first (stable on ties)."""
    weak = [r for r in result if r["weak"]]
    return sorted(weak, key=lambda r: r["correct"] / r["total"] if r["total"] else 0.0)


def gap_tasks(result: list[dict], session: Session) -> list[dict]:
    """≤ 10 tasks from the 5 weakest topics (Req 6). Practice topics stay ordered blocks."""
    topics = weak_topics(result)[:GAP_MAX_TOPICS]
    if not topics:
        return []
    blocks: list[list[dict]] = []
    for r in topics:
        if r["topic"].startswith("p:"):
            block = _practice_block(int(r["topic"][2:]), session)
            if block:
                blocks.append(block)
    budget = GAP_TASK_COUNT - sum(len(b) for b in blocks)
    grammar = [r["topic"] for r in topics if not r["topic"].startswith("p:")]
    pool: list[dict] = []
    if grammar and budget > 0:
        # ceil(budget / n) per topic (= ceil(10/n) when no practice topic is weak)
        per = math.ceil(budget / len(grammar))
        for key in grammar:
            tasks = _grammar_tasks(key, session)
            pool.extend(random.sample(tasks, min(per, len(tasks))))
    random.shuffle(pool)
    pool = pool[:max(0, budget)]
    return _insert_blocks(pool, blocks)[:GAP_TASK_COUNT]


def recommendations(result: list[dict], user: User, session: Session) -> list[dict]:
    """Grammar programs + Practice categories covering the weak topics (Req 7)."""
    weak = weak_topics(result)
    if not weak:
        return []
    programs = [p for p in _grammar_programs(session) if p.is_public]
    program_lessons = {p.id: set(_program_lesson_ids(p, session)) for p in programs}
    cats = {c.id: c for c in _practice_meta(session)["categories"]}
    enrolled_g = cache.enrollment_ids(session, UserGrammarProgram, UserGrammarProgram.program_id, user.id)
    enrolled_p = cache.enrollment_ids(
        session, UserPracticeCategoryEnrollment, UserPracticeCategoryEnrollment.category_id, user.id,
    )

    out: dict[tuple, dict] = {}

    def _add(kind: str, rid: int, ru: str, en: str, enrolled: bool, topic: dict) -> None:
        row = out.setdefault((kind, rid), {
            "kind": kind, "id": rid, "title_ru": ru, "title_en": en or ru,
            "enrolled": enrolled, "reasons": [],
        })
        row["reasons"].append({"title_ru": topic["title_ru"], "title_en": topic["title_en"]})

    for t in weak:
        kind, rid = t["topic"].split(":")
        rid = int(rid)
        if kind == "p":
            c = cats.get(rid)
            if c and _free_published_tests(rid, session):
                _add("practice", rid, c.name_ru, c.name_en, rid in enrolled_p, t)
            continue
        for p in programs:
            if rid in program_lessons[p.id]:
                _add("grammar", p.id, p.title, p.title_en, p.id in enrolled_g, t)
    return list(out.values())
