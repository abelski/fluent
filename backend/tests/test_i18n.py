# Autotests for the frontend i18n system.
# Validates that both language files (ru.ts and en.ts) implement all required
# translation keys defined in types.ts, and that specific strings differ
# between languages (proving the toggle actually switches content).

import re
import os
from pathlib import Path

I18N_DIR = Path(__file__).parent.parent.parent / "frontend" / "lib" / "i18n"


def _read(filename: str) -> str:
    return (I18N_DIR / filename).read_text(encoding="utf-8")


def _extract_top_level_keys(ts_source: str) -> set[str]:
    """Extract top-level namespace keys from a TypeScript object literal."""
    # Match lines like "  common: {" or "  nav: {" inside the const declaration
    return set(re.findall(r"^\s{2}(\w+)\s*:", ts_source, re.MULTILINE))


def _extract_nested_keys(ts_source: str, namespace: str) -> set[str]:
    """
    Extract all leaf key names within a specific namespace block.
    Finds the block `namespace: { ... }` and returns the keys inside.
    """
    # Find the namespace block (handles nested braces)
    pattern = rf"{namespace}\s*:\s*\{{"
    m = re.search(pattern, ts_source)
    if not m:
        return set()
    start = m.end()
    depth = 1
    i = start
    while i < len(ts_source) and depth > 0:
        if ts_source[i] == "{":
            depth += 1
        elif ts_source[i] == "}":
            depth -= 1
        i += 1
    block = ts_source[start : i - 1]
    # Keys: lines starting with optional whitespace then word chars then colon
    return set(re.findall(r"^\s+(\w+)\s*:", block, re.MULTILINE))


# ── Key parity tests ─────────────────────────────────────────────────────────


def test_both_lang_files_exist():
    assert (I18N_DIR / "ru.ts").exists(), "ru.ts missing"
    assert (I18N_DIR / "en.ts").exists(), "en.ts missing"
    assert (I18N_DIR / "types.ts").exists(), "types.ts missing"


def test_top_level_namespaces_match():
    ru = _read("ru.ts")
    en = _read("en.ts")
    ru_keys = _extract_top_level_keys(ru)
    en_keys = _extract_top_level_keys(en)
    # Remove non-namespace tokens (import, const, etc. captured by regex)
    skip = {"import", "const", "export", "default", "type", "return"}
    ru_ns = ru_keys - skip
    en_ns = en_keys - skip
    missing_in_en = ru_ns - en_ns
    missing_in_ru = en_ns - ru_ns
    assert not missing_in_en, f"Namespaces in ru.ts but missing in en.ts: {missing_in_en}"
    assert not missing_in_ru, f"Namespaces in en.ts but missing in ru.ts: {missing_in_ru}"


def test_common_keys_match():
    ru = _read("ru.ts")
    en = _read("en.ts")
    ru_keys = _extract_nested_keys(ru, "common")
    en_keys = _extract_nested_keys(en, "common")
    assert ru_keys == en_keys, (
        f"common keys differ — only in ru: {ru_keys - en_keys}, only in en: {en_keys - ru_keys}"
    )


def test_nav_keys_match():
    ru = _read("ru.ts")
    en = _read("en.ts")
    assert _extract_nested_keys(ru, "nav") == _extract_nested_keys(en, "nav")


def test_admin_keys_match():
    ru = _read("ru.ts")
    en = _read("en.ts")
    assert _extract_nested_keys(ru, "admin") == _extract_nested_keys(en, "admin")


def test_stats_keys_match():
    ru = _read("ru.ts")
    en = _read("en.ts")
    assert _extract_nested_keys(ru, "stats") == _extract_nested_keys(en, "stats")


# ── Language-toggle semantics ─────────────────────────────────────────────────


def test_nav_dictionaries_differs_between_languages():
    """EN and RU must have different strings for the same key (toggle actually changes content)."""
    ru = _read("ru.ts")
    en = _read("en.ts")

    def extract_string(source: str, key: str) -> str | None:
        m = re.search(rf"{key}\s*:\s*'([^']+)'", source)
        return m.group(1) if m else None

    ru_dict = extract_string(ru, "dictionaries")
    en_dict = extract_string(en, "dictionaries")
    assert ru_dict is not None, "nav.dictionaries missing in ru.ts"
    assert en_dict is not None, "nav.dictionaries missing in en.ts"
    assert ru_dict != en_dict, (
        f"nav.dictionaries identical in both languages: '{ru_dict}' — toggle has no effect"
    )


def test_login_strings_differ_between_languages():
    ru_src = _read("ru.ts")
    en_src = _read("en.ts")

    def extract_string(source: str, key: str) -> str | None:
        m = re.search(rf"{key}\s*:\s*'([^']+)'", source)
        return m.group(1) if m else None

    for key in ("signInGoogle", "back"):
        ru_val = extract_string(ru_src, key)
        en_val = extract_string(en_src, key)
        assert ru_val and en_val, f"login.{key} missing in one of the files"
        assert ru_val != en_val, f"login.{key} is identical in RU and EN: '{ru_val}'"


def test_stats_words_learned_differs():
    ru_src = _read("ru.ts")
    en_src = _read("en.ts")

    def extract_string(source: str, key: str) -> str | None:
        m = re.search(rf"{key}\s*:\s*'([^']+)'", source)
        return m.group(1) if m else None

    ru_val = extract_string(ru_src, "wordsLearned")
    en_val = extract_string(en_src, "wordsLearned")
    assert ru_val and en_val
    assert ru_val != en_val, f"stats.wordsLearned identical: '{ru_val}'"


def test_no_russian_cyrillic_in_en_file():
    """en.ts must not contain Cyrillic characters (would mean untranslated strings)."""
    en_src = _read("en.ts")
    cyrillic = re.findall(r"[А-яЁё]+", en_src)
    assert not cyrillic, f"Cyrillic found in en.ts: {cyrillic[:5]}"


def test_no_english_only_words_in_ru_file():
    """Spot-check: a few key English-only nav terms must not appear verbatim in ru.ts strings."""
    ru_src = _read("ru.ts")
    # These English words must not appear inside string literals in ru.ts
    # (they're fine as code — check within quoted strings only)
    for eng_word in ("Dictionaries", "Grammar", "Sign in", "Sign out"):
        # look inside single-quoted strings
        if re.search(rf"'\s*{re.escape(eng_word)}\s*'", ru_src):
            raise AssertionError(
                f"English string '{eng_word}' found in ru.ts — possible missing translation"
            )
