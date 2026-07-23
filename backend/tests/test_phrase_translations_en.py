# Regression guard for issue #148: phrase program "Sékmės! A1.1" was seeded with
# translation_en = NULL on all 181 rows, so English-language users silently saw the
# Russian translation.
#
# These are pure data checks over the seed source + the committed translation
# module — the test suite runs on an in-memory SQLite DB and never touches
# production (see conftest.py), so the guard has to live at the data-definition
# level. The failure mode it catches: someone adds a phrase to seed_phrases.py
# without a matching English translation.

from seed_phrases import CHAPTERS
from scripts.phrase_translations_en_a11 import TRANSLATIONS


def _all_seed_phrases() -> list[tuple[str, str]]:
    return [pair for chapter in CHAPTERS for pair in chapter["phrases"]]


def test_every_seeded_phrase_has_an_english_translation():
    """No phrase may ship without English — that is what caused issue #148."""
    unmapped = sorted({text for text, _ in _all_seed_phrases() if text not in TRANSLATIONS})
    assert not unmapped, (
        f"{len(unmapped)} seeded phrase(s) have no entry in "
        f"phrase_translations_en_a11.TRANSLATIONS: {unmapped}"
    )


def test_no_english_translation_is_blank():
    blank = sorted(k for k, v in TRANSLATIONS.items() if not (v or "").strip())
    assert not blank, f"blank English translation for: {blank}"


def test_no_english_translation_is_cyrillic():
    """A Russian string left in the English column is the bug wearing a disguise."""
    cyrillic = sorted(
        k for k, v in TRANSLATIONS.items()
        if any("Ѐ" <= ch <= "ӿ" for ch in v)
    )
    assert not cyrillic, f"Cyrillic text in the English translation for: {cyrillic}"


def test_translation_keys_all_correspond_to_real_phrases():
    """Guard against typo'd keys that would silently never match a row."""
    seed_texts = {text for text, _ in _all_seed_phrases()}
    orphans = sorted(set(TRANSLATIONS) - seed_texts)
    assert not orphans, f"translation keys matching no seeded phrase: {orphans}"
