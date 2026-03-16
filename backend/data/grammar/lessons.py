import json
from pathlib import Path

_data = json.loads(
    (Path(__file__).parent.parent.parent.parent / "content/grammar/lessons.json")
    .read_text(encoding="utf-8")
)

LESSON_CONFIG = [list(row) for row in _data["lessons"]]
CASE_INFO = {int(k): tuple(v) for k, v in _data["cases"].items()}
