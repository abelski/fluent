# DB upsert helpers for the loader.
# Connects to PostgreSQL using the same DATABASE_URL as the backend.
# Never deletes rows — uses soft-delete (archived=True) to preserve user progress.

import os
import re
import sys
from pathlib import Path
from dotenv import load_dotenv
from sqlmodel import SQLModel, Session, create_engine, select

# Load .env from repo root (two levels up from content/loader/)
_env_path = Path(__file__).parent.parent.parent / "backend" / ".env"
load_dotenv(_env_path)

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set. Add it to backend/.env", file=sys.stderr)
    sys.exit(1)

# Normalise URL to psycopg3 dialect (same logic as backend/database.py)
DATABASE_URL = re.sub(r"^postgres(ql)?://", "postgresql+psycopg://", DATABASE_URL)
DATABASE_URL = re.sub(r"[&?]channel_binding=[^&]*", "", DATABASE_URL)
if "sslmode" not in DATABASE_URL:
    DATABASE_URL += ("&" if "?" in DATABASE_URL else "?") + "sslmode=require"

engine = create_engine(DATABASE_URL, echo=False, pool_pre_ping=True)

# Import models AFTER engine is ready
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "backend"))
from models import GrammarSentence, GrammarCaseRule, Word, WordList, WordListItem, Article  # noqa: E402
from parsers import GrammarFileResult, GrammarSentenceRow, VocabFileResult, ArticleResult  # noqa: E402


def ensure_tables():
    """Create tables if they don't exist yet (idempotent)."""
    SQLModel.metadata.create_all(engine)


# ── Grammar ───────────────────────────────────────────────────────────────────

def upsert_grammar_file(result: GrammarFileResult, dry_run: bool = False) -> dict:
    """Upsert sentences from one grammar file. Returns counts."""
    added = updated = unchanged = 0

    with Session(engine) as session:
        # Load all existing (non-archived) sentences for this case_index
        existing = {
            row.display: row
            for row in session.exec(
                select(GrammarSentence).where(
                    GrammarSentence.case_index == result.case_index,
                    GrammarSentence.archived == False,  # noqa: E712
                )
            ).all()
        }

        # Soft-archive sentences that are no longer in the file
        file_displays = {s.display for s in result.sentences}
        for display, row in existing.items():
            if display not in file_displays:
                if not dry_run:
                    row.archived = True
                    session.add(row)

        for s in result.sentences:
            if s.display in existing:
                row = existing[s.display]
                if (row.answer_ending != s.answer_ending
                        or row.full_word != s.full_word
                        or row.russian != s.russian):
                    if not dry_run:
                        row.answer_ending = s.answer_ending
                        row.full_word = s.full_word
                        row.russian = s.russian
                        session.add(row)
                    updated += 1
                else:
                    unchanged += 1
            else:
                if not dry_run:
                    session.add(GrammarSentence(
                        case_index=s.case_index,
                        display=s.display,
                        answer_ending=s.answer_ending,
                        full_word=s.full_word,
                        russian=s.russian,
                    ))
                added += 1

        if not dry_run:
            session.commit()

    # Upsert rule metadata if the file had all rule headers
    if result.rule is not None:
        r = result.rule
        with Session(engine) as session:
            existing_rule = session.exec(
                select(GrammarCaseRule).where(GrammarCaseRule.case_index == r.case_index)
            ).first()
            if existing_rule is None:
                if not dry_run:
                    session.add(GrammarCaseRule(
                        case_index=r.case_index,
                        name_ru=r.name_ru,
                        question=r.question,
                        usage=r.usage,
                        endings_sg=r.endings_sg,
                        endings_pl=r.endings_pl,
                        transform=r.transform,
                    ))
                    session.commit()
            else:
                changed = (
                    existing_rule.name_ru != r.name_ru
                    or existing_rule.question != r.question
                    or existing_rule.usage != r.usage
                    or existing_rule.endings_sg != r.endings_sg
                    or existing_rule.endings_pl != r.endings_pl
                    or existing_rule.transform != r.transform
                )
                if changed and not dry_run:
                    existing_rule.name_ru = r.name_ru
                    existing_rule.question = r.question
                    existing_rule.usage = r.usage
                    existing_rule.endings_sg = r.endings_sg
                    existing_rule.endings_pl = r.endings_pl
                    existing_rule.transform = r.transform
                    session.add(existing_rule)
                    session.commit()

    return {"added": added, "updated": updated, "unchanged": unchanged}


# ── Articles ───────────────────────────────────────────────────────────────────

def upsert_article_file(result: ArticleResult, dry_run: bool = False) -> dict:
    """Upsert one article from a parsed markdown file. Returns counts."""
    from datetime import datetime, timezone

    def _utcnow():
        return datetime.now(timezone.utc).replace(tzinfo=None)

    with Session(engine) as session:
        existing = session.exec(
            select(Article).where(Article.slug == result.slug)
        ).first()

        if existing:
            changed = (
                existing.title_ru != result.title_ru
                or existing.title_en != result.title_en
                or existing.body_ru != result.body_ru
                or existing.body_en != result.body_en
                or existing.tags != result.tags
                or existing.published != result.published
            )
            if changed:
                if not dry_run:
                    existing.title_ru = result.title_ru
                    existing.title_en = result.title_en
                    existing.body_ru = result.body_ru
                    existing.body_en = result.body_en
                    existing.tags = result.tags
                    existing.published = result.published
                    existing.updated_at = _utcnow()
                    session.add(existing)
                    session.commit()
                return {"added": 0, "updated": 1, "unchanged": 0}
            return {"added": 0, "updated": 0, "unchanged": 1}

        if not dry_run:
            article = Article(
                slug=result.slug,
                title_ru=result.title_ru,
                title_en=result.title_en,
                body_ru=result.body_ru,
                body_en=result.body_en,
                tags=result.tags,
                published=result.published,
            )
            session.add(article)
            session.commit()

    return {"added": 1, "updated": 0, "unchanged": 0}


# ── Vocabulary ────────────────────────────────────────────────────────────────

def upsert_vocab_file(result: VocabFileResult, dry_run: bool = False) -> dict:
    """Upsert one vocabulary file (one WordList + its Words). Returns counts."""
    added = updated = unchanged = 0

    with Session(engine) as session:
        # Find or create WordList by (subcategory, title)
        word_list = session.exec(
            select(WordList).where(
                WordList.title == result.title,
                WordList.subcategory == result.subcategory,
            )
        ).first()

        if word_list is None:
            if not dry_run:
                word_list = WordList(
                    title=result.title,
                    subcategory=result.subcategory,
                    description=result.description,
                    is_public=True,
                )
                session.add(word_list)
                session.flush()  # get word_list.id
        else:
            if word_list.archived:
                if not dry_run:
                    word_list.archived = False
            if word_list.description != result.description:
                if not dry_run:
                    word_list.description = result.description
                    session.add(word_list)

        if dry_run:
            # Can't do relational work without a real word_list.id in dry-run
            for _ in result.words:
                added += 1
            return {"added": added, "updated": updated, "unchanged": unchanged}

        session.flush()

        # Build lookup of existing words in this list by lithuanian text
        existing_items = session.exec(
            select(WordListItem, Word)
            .join(Word, WordListItem.word_id == Word.id)
            .where(WordListItem.word_list_id == word_list.id)
        ).all()
        existing: dict[str, tuple[WordListItem, Word]] = {
            word.lithuanian: (item, word) for item, word in existing_items
        }

        file_lithuanians = {w.lithuanian for w in result.words}

        # Soft-archive words removed from the file
        for lithuanian, (item, word) in existing.items():
            if lithuanian not in file_lithuanians and not word.archived:
                word.archived = True
                session.add(word)

        for position, vocab_word in enumerate(result.words):
            if vocab_word.lithuanian in existing:
                item, word = existing[vocab_word.lithuanian]
                changed = False
                if word.archived:
                    word.archived = False
                    changed = True
                if (word.translation_en != vocab_word.translation_en
                        or word.translation_ru != vocab_word.translation_ru
                        or word.hint != vocab_word.hint):
                    word.translation_en = vocab_word.translation_en
                    word.translation_ru = vocab_word.translation_ru
                    word.hint = vocab_word.hint
                    changed = True
                if item.position != position:
                    item.position = position
                    session.add(item)
                if changed:
                    session.add(word)
                    updated += 1
                else:
                    unchanged += 1
            else:
                # Check if the word already exists in the global word table
                word = session.exec(
                    select(Word).where(Word.lithuanian == vocab_word.lithuanian)
                ).first()
                if word is None:
                    word = Word(
                        lithuanian=vocab_word.lithuanian,
                        translation_en=vocab_word.translation_en,
                        translation_ru=vocab_word.translation_ru,
                        hint=vocab_word.hint,
                    )
                    session.add(word)
                    session.flush()
                item = WordListItem(
                    word_list_id=word_list.id,
                    word_id=word.id,
                    position=position,
                )
                session.add(item)
                added += 1

        session.commit()

    return {"added": added, "updated": updated, "unchanged": unchanged}
