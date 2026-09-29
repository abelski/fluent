"""#55 — fill_practice_sections_article_themes.py: dry-run, abort on unmatched key, fill only empty."""
import json
import sys
from pathlib import Path

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

from models import Article, PracticeTest

_BACKEND = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_BACKEND / "scripts"))
import fill_practice_sections_article_themes as fill  # noqa: E402

_ROWS = json.loads(fill.DATA_PATH.read_text(encoding="utf-8"))


def _fresh() -> Session:
    """Own in-memory DB with one row per key in the data file (the shared test DB stays untouched)."""
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    s = Session(engine)
    for r in _ROWS:
        if r["table"] == "practice_test":
            s.add(PracticeTest(title_ru=r["title_ru"]))
        else:
            s.add(Article(slug=r["slug"], title_ru="т", title_en="t"))
    s.commit()
    return s


def test_data_covers_constitution_and_30_articles():
    tests = [r for r in _ROWS if r["table"] == "practice_test"]
    assert len(tests) == 33
    assert [r["title_ru"] for r in tests if r.get("is_final")] == ["Baigiamasis egzaminas"]
    arts = [r for r in _ROWS if r["table"] == "article"]
    assert len(arts) == 30 and len({r["slug"] for r in arts}) == 30
    from routers.articles import ARTICLE_THEMES
    assert {r["theme"] for r in arts} <= set(ARTICLE_THEMES)
    assert all(len(r["section_ru"]) <= 120 and len(r["section_en"]) <= 120 for r in tests)


def test_dry_run_changes_nothing():
    s = _fresh()
    counts = fill.run(s, apply=False)
    assert counts["section_ru"] == 33 and counts["theme"] == 30 and counts["is_final"] == 1
    s.expire_all()
    assert s.exec(select(PracticeTest).where(PracticeTest.section_ru != None)).first() is None  # noqa: E711
    assert s.exec(select(Article).where(Article.theme != None)).first() is None  # noqa: E711


def test_apply_fills_only_empty_fields():
    s = _fresh()
    kept = s.exec(select(Article).where(Article.slug == "verb-intro")).one()
    kept.theme = "start"  # an admin already chose something else
    t = s.exec(select(PracticeTest).where(PracticeTest.title_ru == "Tik skaičiai ir datos")).one()
    t.section_ru = "Своя секция"
    s.add(kept); s.add(t); s.commit()

    counts = fill.run(s, apply=True)
    assert counts["theme"] == 29 and counts["section_ru"] == 32 and counts["section_en"] == 33
    s.expire_all()
    assert s.exec(select(Article).where(Article.slug == "verb-intro")).one().theme == "start"
    t = s.exec(select(PracticeTest).where(PracticeTest.title_ru == "Tik skaičiai ir datos")).one()
    assert (t.section_ru, t.section_en) == ("Своя секция", "Final tests")
    final = s.exec(select(PracticeTest).where(PracticeTest.title_ru == "Baigiamasis egzaminas")).one()
    assert final.is_final is True and final.section_ru == "Итоговые тесты"
    assert s.exec(select(PracticeTest).where(PracticeTest.is_final == True)).all() == [final]  # noqa: E712
    # Re-run is a no-op.
    again = fill.run(s, apply=True)
    assert again["section_ru"] == again["section_en"] == again["theme"] == again["is_final"] == 0


def test_unmatched_key_aborts_before_writing():
    s = _fresh()
    gone = s.exec(select(Article).where(Article.slug == "verb-intro")).one()
    s.delete(gone); s.commit()
    with pytest.raises(fill.UnmatchedKeys, match="verb-intro"):
        fill.run(s, apply=True)
    s.expire_all()
    assert s.exec(select(PracticeTest).where(PracticeTest.section_ru != None)).first() is None  # noqa: E711
