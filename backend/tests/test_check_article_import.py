"""#58a — check_article_import.py on inline fixtures (never reads temp_files/)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
import check_article_import as chk  # noqa: E402

SENT_RU = "Первое предложение описания достаточно длинное, чтобы занять место. " * 2  # 136 chars
FM = "---\nslug: s\ntitle_ru: Т\ntitle_en: T\ncategory: learning_materials\n---\n\n"


def _ok_body(prefix: str) -> str:
    first = (prefix * 200)[:159] + "."  # sentence ends exactly at char 160
    return f"# Title\n\n**{first}**\n\nMore text [link](/x/)."


def test_valid_article_passes_and_strips_heading_and_markdown():
    errors, d = chk.check(FM + _ok_body("а") + "\n\n---EN---\n\n" + _ok_body("b"))
    assert errors == []
    assert d["ru"] == "а" * 159 + "." and d["en"] == "b" * 159 + "."


def test_missing_body_en_fails():
    errors, _ = chk.check(FM + _ok_body("а"))
    assert any("body_en" in e for e in errors)


def test_description_cut_mid_word_fails():
    errors, d = chk.check(FM + SENT_RU + "Ещё слово за словом до конца\n\n---EN---\n\n" + _ok_body("b"))
    assert len(d["ru"]) == 160 and any("ru meta" in e for e in errors)


def test_invalid_category_fails():
    errors, _ = chk.check(FM.replace("learning_materials", "news") + _ok_body("а") + "\n\n---EN---\n\n" + _ok_body("b"))
    assert any("category" in e for e in errors)


def test_missing_title_en_fails():
    errors, _ = chk.check(FM.replace("title_en: T\n", "") + _ok_body("а") + "\n\n---EN---\n\n" + _ok_body("b"))
    assert any("title_en" in e for e in errors)
