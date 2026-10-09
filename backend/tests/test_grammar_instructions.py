"""#63 — every grammar task carries a server-built instruction line."""
import grammar_service as gs

MC = [{"type": "sentence", "options": ["a", "b", "c", "d"]}]
TYPED = [{"type": "sentence"}]


def _fake(tasks):
    return lambda *a, **k: [dict(t) for t in tasks]


def _lesson(monkeypatch, lesson_id, tasks):
    monkeypatch.setattr(gs, "_generate_sentence_tasks", _fake(tasks))
    return gs.get_lesson_tasks(lesson_id, None)[0]


def _verb(monkeypatch, lesson_id, tasks):
    monkeypatch.setattr(gs, "_generate_verb_case_tasks", _fake(tasks))
    monkeypatch.setattr(gs, "_generate_verb_conjugation_tasks", _fake(tasks))
    return gs.get_verb_lesson_tasks(lesson_id, None)[0]


def test_noun_basic_says_pick_and_case(monkeypatch):
    t = _lesson(monkeypatch, 1, MC)  # Galininkas Vns., basic
    assert t["instruction_ru"] == "Выбери правильную форму: винительный падеж, ед. ч."
    assert t["instruction_en"] == "Pick the right form: accusative, singular"


def test_noun_advanced_says_type(monkeypatch):
    t = _lesson(monkeypatch, 2, TYPED)
    assert t["instruction_ru"].startswith("Впиши правильную форму: винительный")
    assert t["instruction_en"].startswith("Type the right form")


def test_numeral_lesson(monkeypatch):
    t = _lesson(monkeypatch, 70, MC)  # Kiekiniai: Vardininkas
    assert t["instruction_ru"] == "Выбери правильную форму числительного: именительный падеж"
    assert t["instruction_en"] == "Pick the right form of the numeral: nominative"


def test_verb_conjugation_carries_tense(monkeypatch):
    t = _verb(monkeypatch, 200, MC)
    assert t["instruction_ru"] == "Выбери форму глагола: Настоящее время"
    assert t["instruction_en"] == "Pick the verb form: Present tense"


def test_verb_case_line(monkeypatch):
    t = _verb(monkeypatch, 300, TYPED)
    assert t["instruction_ru"] == "Впиши правильный падеж после глагола"
    assert t["instruction_en"] == "Type the right case after the verb"


def test_every_lesson_gets_a_line(monkeypatch):
    for lid, *_ in gs.LESSON_CONFIG:
        t = _lesson(monkeypatch, lid, MC)
        assert t.get("instruction_ru") and t.get("instruction_en"), lid
