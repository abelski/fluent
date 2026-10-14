"""#188/#189: «Šiukšles išneša Ingos duktė.» is false per the text (the son takes out the trash), so answer is 'b'."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from seed_skaitymas_new import LESSONS  # noqa: E402


def test_trash_question_answer_is_neteisingas():
    lesson = next(l for l in LESSONS if l.get("title_en") == "13 skyrius — Darbai namie")
    answers = dict(lesson["questions"])
    assert answers["Šiukšles išneša Ingos duktė."] == "b"
