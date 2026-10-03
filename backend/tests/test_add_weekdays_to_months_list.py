"""#58a — add_weekdays_to_months_list.py: report-only, apply, idempotent, aborts with no writes."""
import sys
from pathlib import Path

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from models import Word, WordList, WordListItem

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import add_weekdays_to_months_list as script  # noqa: E402


def _fresh(subcategory="sekmes", words=None) -> Session:
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    s = Session(engine)
    s.add(WordList(id=237, title="Mėnesiai", title_en="Months", subcategory=subcategory))
    for i in range(12):
        s.add(Word(id=5000 + i, lithuanian=f"m{i}", translation_en="m", translation_ru="м"))
        s.add(WordListItem(word_list_id=237, word_id=5000 + i, position=i + 1))
    for wid, lt in (words if words is not None else script.WEEKDAYS).items():
        s.add(Word(id=wid, lithuanian=lt, translation_en="d", translation_ru="д"))
    s.commit()
    return s


def _items(s):
    s.expire_all()
    return s.exec(select(WordListItem.word_id, WordListItem.position)
                  .where(WordListItem.word_list_id == 237).order_by(WordListItem.position)).all()


def test_report_only_writes_nothing():
    s = _fresh()
    assert script.run(s, apply=False) == {"added": 7, "renamed": 1}
    assert len(_items(s)) == 12
    assert s.get(WordList, 237).title == "Mėnesiai"


def test_apply_appends_in_order_renames_then_noop():
    s = _fresh()
    assert script.run(s, apply=True) == {"added": 7, "renamed": 1}
    items = _items(s)
    assert items[12:] == [(wid, 13 + i) for i, wid in enumerate(script.WEEKDAYS)]
    wl = s.get(WordList, 237)
    assert (wl.title, wl.title_en) == ("Mėnesiai ir savaitės dienos", "Months and days of the week")
    assert script.run(s, apply=True) == {"added": 0, "renamed": 0}
    assert len(_items(s)) == 19


def test_partial_state_adds_only_missing():
    s = _fresh()
    s.add(WordListItem(word_list_id=237, word_id=3240, position=13)); s.commit()
    assert script.run(s, apply=True)["added"] == 6
    assert [w for w, _ in _items(s)].count(3240) == 1


@pytest.mark.parametrize("kwargs", [
    {"subcategory": "other"},
    {"words": {k: v for k, v in script.WEEKDAYS.items() if k != 3244}},
    {"words": {**script.WEEKDAYS, 3242: "penktas"}},
])
def test_aborts_with_no_writes(kwargs):
    s = _fresh(**kwargs)
    with pytest.raises(script.Abort):
        script.run(s, apply=True)
    assert len(_items(s)) == 12
    assert s.get(WordList, 237).title == "Mėnesiai"
