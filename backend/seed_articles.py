"""One-shot script: import all .md files from temp_files/articles/ into the DB."""
import re
import sys
from pathlib import Path
from datetime import datetime, timezone

# Resolve paths relative to repo root (one level up from backend/)
REPO_ROOT = Path(__file__).parent.parent
ARTICLES_DIR = REPO_ROOT / "temp_files" / "articles"

sys.path.insert(0, str(Path(__file__).parent))

from database import engine
from models import Article
from sqlmodel import Session, select


def _utcnow():
    return datetime.now(timezone.utc)


def parse(content: str) -> dict:
    fm_match = re.match(r"^---\n(.*?)\n---\n", content, re.DOTALL)
    if not fm_match:
        raise ValueError("Missing YAML frontmatter")
    fm = fm_match.group(1)
    body_part = content[fm_match.end():]

    def _get(key):
        m = re.search(rf"^{key}:\s*(.+)$", fm, re.MULTILINE)
        return m.group(1).strip() if m else ""

    if "---EN---" in body_part:
        parts = body_part.split("---EN---", 1)
        body_ru, body_en = parts[0].strip(), parts[1].strip()
    else:
        body_ru, body_en = body_part.strip(), ""

    return {
        "slug": _get("slug"),
        "title_ru": _get("title_ru"),
        "title_en": _get("title_en"),
        "tags": _get("tags"),
        "published": _get("published").lower() != "false",
        "body_ru": body_ru,
        "body_en": body_en,
    }


def main():
    files = sorted(ARTICLES_DIR.glob("*.md"))
    if not files:
        print(f"No .md files found in {ARTICLES_DIR}")
        sys.exit(1)

    with Session(engine) as session:
        for path in files:
            data = parse(path.read_text(encoding="utf-8"))
            existing = session.exec(
                select(Article).where(Article.slug == data["slug"])
            ).first()

            if existing:
                for k, v in data.items():
                    setattr(existing, k, v)
                existing.updated_at = _utcnow()
                action = "updated"
            else:
                article = Article(**data, created_at=_utcnow(), updated_at=_utcnow())
                session.add(article)
                action = "created"

            session.commit()
            print(f"  {action}: {data['slug']}")

    print(f"\nDone — {len(files)} articles imported.")


if __name__ == "__main__":
    main()
