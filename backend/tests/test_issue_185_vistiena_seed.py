"""#185: vištiena is chicken *meat* (курятина), not the bird (višta, курица)."""
from seed_ne_dienos_2 import LESSONS


def _rows():
    for lesson in LESSONS:
        for words in lesson.values() if isinstance(lesson, dict) else [lesson]:
            if isinstance(words, list):
                yield from (w for w in words if isinstance(w, tuple))


def test_vistiena_is_kuryatina():
    rows = {w[0]: w for w in _rows()}
    assert rows["vištiena"][1:] == ("курятина", "chicken (meat)")
