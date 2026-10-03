"""Check article .md files before an admin import (#58a). Read-only, no DB.

Parses each file with the import parser, requires a valid category and a non-empty English twin
(title_en + body_en), and prints the RU and EN meta descriptions exactly as
`articleMetadata` in frontend/app/dashboard/articles/[slug]/articleSeo.tsx builds them.
Fails unless each description ends on a full sentence ([.!?]).

Usage (from backend/):
    .venv/bin/python scripts/check_article_import.py ../temp_files/articles/<slug>.md [...]
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from routers.articles import _VALID_CATEGORIES, _parse_markdown_article  # noqa: E402


def meta_description(body: str) -> str:
    """Python port of the articleSeo.tsx transform."""
    s = re.sub(r"^#.*\n+", "", body, count=1)
    s = re.sub(r"[#*`\[\]]", "", s)
    s = re.sub(r"\s+", " ", s)
    return s[:160].strip()


def check(content: str) -> tuple[list[str], dict[str, str]]:
    """Returns (errors, {'ru': desc, 'en': desc})."""
    try:
        art = _parse_markdown_article(content)
    except ValueError as e:
        return [str(e)], {}
    errors = []
    # The parser silently falls back to 'blog' on an unknown category, so read the raw value.
    raw = re.search(r"^category:\s*(.+)$", content.split("\n---\n", 1)[0], re.MULTILINE)
    if not raw or raw.group(1).strip() not in _VALID_CATEGORIES:
        errors.append(f"category must be one of {sorted(_VALID_CATEGORIES)}")
    if not art.get("title_en"):
        errors.append("title_en is empty: no /en/ twin")
    if not art["body_en"]:
        errors.append("body_en is empty (no ---EN--- section): no /en/ twin")
    descs = {"ru": meta_description(art["body_ru"]), "en": meta_description(art["body_en"])}
    for lang, d in descs.items():
        if not d or d[-1] not in ".!?":
            errors.append(f"{lang} meta description does not end on . ! or ?")
        if "(" in d and "/" in d:
            errors.append(f"{lang} meta description seems to contain a link")
    return errors, descs


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    failed = False
    for name in sys.argv[1:]:
        errors, descs = check(Path(name).read_text(encoding="utf-8"))
        print(f"== {name}")
        for lang, d in descs.items():
            print(f"  {lang} ({len(d)}): {d}")
        for e in errors:
            print(f"  ERROR: {e}")
        failed |= bool(errors)
        print("  OK" if not errors else "  FAILED")
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
