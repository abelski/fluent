"""#187: Art. 78 — the President must be a Lithuanian citizen by origin (answer b)."""
import json
from pathlib import Path


def test_president_citizenship_answer_is_b():
    path = Path(__file__).resolve().parent.parent / "data" / "constitution" / "questions.json"
    questions = json.loads(path.read_text(encoding="utf-8"))
    q = next(
        q for q in questions
        if q["question_ru"] == "Гражданином какого государства должен быть кандидат на пост Президента Литвы?"
    )
    assert q["correct_option"] == "b"
