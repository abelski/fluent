"""#66 — scripts/fix_practice_titles_66.py: dry run writes nothing, apply fixes the titles,
a second apply is a no-op. Runs on its own in-memory DB so it never touches shared fixtures."""
import sys
from pathlib import Path

import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine, select

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import fix_practice_titles_66 as fix  # noqa: E402

from models import GrammarProgram, PracticeCategory, PracticeTest  # noqa: E402


@pytest.fixture()
def session():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as s:
        cit = PracticeCategory(name_ru="Конституция")
        rd = PracticeCategory(name_ru="Чтение")
        s.add(cit)
        s.add(rd)
        s.commit()
        for title_ru, title_en in [
            ("Пример теста Конституция Литвы", "Sample test Lithuanian Constitution"),
            ("5 pamoka: Saviraiška, tikėjimas, lygybė, nekaltumo prezumpcija (25–31 str.)", "Lesson 5: Art. 25–31"),
            ("Kartojimas 1: 1–5 pamokos (1–31 str.)", "Review 1: Lessons 1–5"),
            ("Baigiamasis egzaminas", "Final Exam"),
        ]:
            s.add(PracticeTest(category_id=cit.id, title_ru=title_ru, title_en=title_en, status="published"))
        s.add(PracticeTest(category_id=rd.id, title_ru="«Это моя семья»", title_en="5 skyrius — Cia mano seima", status="published"))
        s.add(GrammarProgram(title="Спряжение глаголов", program_type="verbs",
                             description="Упражнения на спряжение. 12 уроков.", description_en="Conjugation drills. 12 lessons."))
        s.commit()
        yield s


def _titles(s: Session) -> dict[str, tuple]:
    return {t.title_en: (t.title_ru, t.title_lt) for t in s.exec(select(PracticeTest)).all()}


def test_dry_run_writes_nothing(session):
    before = _titles(session)
    counts = fix.run(session, apply=False)
    assert counts["changed"] == 7  # 4 Constitution + 1 reading test + reading description + verbs
    assert _titles(session) == before


def test_apply_fixes_titles_and_second_run_is_a_noop(session):
    fix.run(session, apply=True)
    titles = _titles(session)
    assert titles["Sample test"] == ("Пробный тест", None)
    assert titles["Test 5: Art. 25–31"] == (
        "Тест 5: статьи 25–31", "5 pamoka: Saviraiška, tikėjimas, lygybė, nekaltumo prezumpcija (25–31 str.)")
    assert titles["Checkpoint 1: Art. 1–31"] == ("Контрольная 1: статьи 1–31", "Kartojimas 1: 1–5 pamokos (1–31 str.)")
    assert titles["Final Exam"] == ("Итоговый экзамен", "Baigiamasis egzaminas")
    assert titles["This is my family"] == ("Это моя семья", "5 skyrius — Čia mano šeima")
    reading = session.exec(select(PracticeCategory).where(PracticeCategory.name_ru == "Чтение")).one()
    assert reading.description_ru and reading.description_en
    verbs = session.exec(select(GrammarProgram)).one()
    assert verbs.description.endswith("20 уроков.") and verbs.description_en.endswith("20 lessons.")

    again = fix.run(session, apply=True)
    assert again["changed"] == 0 and again["unmatched"] == 0
    assert _titles(session) == titles


def test_admin_edited_reading_description_is_kept(session):
    reading = session.exec(select(PracticeCategory).where(PracticeCategory.name_ru == "Чтение")).one()
    reading.description_ru = "Своё описание"
    session.add(reading)
    session.commit()
    fix.run(session, apply=True)
    assert reading.description_ru == "Своё описание"
