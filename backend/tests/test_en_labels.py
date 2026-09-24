# Plan #48a (English UI coverage) — the verb-lesson and grammar-task endpoints must
# carry non-empty EN labels/hints/prompts alongside the existing RU ones, with no
# Cyrillic anywhere in the EN fields. Uses TestClient + in-memory SQLite (conftest).

import json
import re

import pytest
from sqlmodel import Session

import database as _db
from models import Verb
from grammar_service import (
    _generate_declension_tasks,
    _generate_verb_conjugation_tasks,
    WORDS,
)

# conftest's create_all ran before Verb was imported, so its table does not exist yet.
Verb.__table__.create(_db.engine, checkfirst=True)

CYRILLIC_RE = re.compile(r"[А-Яа-яЁё]")


@pytest.fixture(scope="module")
def sample_verb():
    """A minimal verb with indicative_present data, so the task generator has a pool."""
    with Session(_db.engine) as s:
        v = Verb(
            number=99001,
            infinitive="dirbti",
            present_3p="dirba",
            past_3p="dirbo",
            translation_ru="работать",
            conjugations=json.dumps({
                "indicative_present": {
                    "aš": "dirbu", "tu": "dirbi",
                    "jis, ji, jie, jos": "dirba", "mes": "dirbame", "jūs": "dirbate",
                },
            }, ensure_ascii=False),
            programs=json.dumps(["sekmes"]),
        )
        s.add(v)
        s.commit()
        vid = v.id
    yield vid
    with Session(_db.engine) as s:
        s.delete(s.get(Verb, vid))
        s.commit()


class TestVerbLessonListLabels:
    def test_conjugation_lessons_have_non_cyrillic_title_en_and_hint_en(self, client):
        r = client.get("/api/grammar/verb-lessons?program_type=verbs")
        assert r.status_code == 200
        lessons = r.json()
        assert len(lessons) > 0
        for lesson in lessons:
            assert lesson["title_en"], lesson
            assert not CYRILLIC_RE.search(lesson["title_en"]), lesson["title_en"]
            assert lesson["hint_en"], lesson
            assert not CYRILLIC_RE.search(lesson["hint_en"]["description"]), lesson["hint_en"]
            for label, value in lesson["hint_en"]["rows"]:
                assert not CYRILLIC_RE.search(label), label
                assert not CYRILLIC_RE.search(value), value

    def test_verb_case_lessons_have_non_cyrillic_title_en(self, client):
        r = client.get("/api/grammar/verb-lessons?program_type=verb_cases")
        assert r.status_code == 200
        lessons = r.json()
        assert len(lessons) > 0
        for lesson in lessons:
            assert lesson["title_en"] == "Verb government"
            assert not CYRILLIC_RE.search(lesson["title_en"])


class TestVerbConjugationTaskLabels:
    def test_tense_label_en_is_present_and_non_cyrillic(self, sample_verb):
        with Session(_db.engine) as s:
            tasks = _generate_verb_conjugation_tasks("indicative_present", 5, s)
        assert len(tasks) > 0
        for task in tasks:
            assert task["tense_label_en"] == "Present tense"
            assert not CYRILLIC_RE.search(task["tense_label_en"])


class TestDeclensionPromptEn:
    def test_prompt_en_is_present_and_non_cyrillic_for_every_word(self):
        # words.txt now carries an en column for every noun — exercise the generator
        # directly since declension tasks are only a read-time fallback via HTTP.
        tasks = _generate_declension_tasks([1], len(WORDS))
        assert len(tasks) > 0
        for task in tasks:
            assert task["prompt_en"], task
            assert not CYRILLIC_RE.search(task["prompt_en"]), task["prompt_en"]
