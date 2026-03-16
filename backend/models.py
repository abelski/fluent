# SQLModel ORM models — each class maps 1:1 to a PostgreSQL table.
# SQLModel combines SQLAlchemy table definition with Pydantic validation,
# so the same class is used for DB access and for API response serialization.

import uuid
from datetime import datetime, date, timezone
from typing import Optional
from sqlmodel import SQLModel, Field


def _utcnow() -> datetime:
    """Return current UTC time as a naive datetime (for storage in TIMESTAMP columns)."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


class User(SQLModel, table=True):
    """Registered user. Created on first Google OAuth login, updated on subsequent logins."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    email: str = Field(unique=True, index=True)
    name: str
    picture: Optional[str] = None
    lang: str = Field(default="en")  # preferred UI language: 'en' | 'ru'
    created_at: datetime = Field(default_factory=_utcnow)
    is_premium: bool = Field(default=False)
    premium_until: Optional[datetime] = None  # None = no expiry; past date = expired
    is_admin: bool = Field(default=False)
    is_superadmin: bool = Field(default=False)


class WordList(SQLModel, table=True):
    """A named collection of words (e.g. "Numbers 1-20", "Animals").
    is_public=True means any user can study it without special access."""
    __tablename__ = "word_list"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: Optional[str] = None
    subcategory: Optional[str] = None  # parent folder name from content/vocabulary/<subcategory>/
    is_public: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utcnow)
    archived: bool = Field(default=False)  # soft-delete: hide but preserve FK integrity


class Word(SQLModel, table=True):
    """A single Lithuanian word with translations in both English and Russian.
    Words are shared across lists — the same word can belong to multiple lists."""
    __tablename__ = "word"
    id: Optional[int] = Field(default=None, primary_key=True)
    lithuanian: str
    translation_en: str
    translation_ru: str
    hint: Optional[str] = None  # e.g. "m. / f." or grammatical note
    archived: bool = Field(default=False)  # soft-delete: hide but preserve FK integrity


class WordListItem(SQLModel, table=True):
    """Join table between WordList and Word with an explicit ordering position.
    Using a separate join table (vs. a many-to-many relation) allows per-list
    word ordering without duplicating word data."""
    __tablename__ = "word_list_item"
    id: Optional[int] = Field(default=None, primary_key=True)
    word_list_id: int = Field(foreign_key="word_list.id", index=True)
    word_id: int = Field(foreign_key="word.id", index=True)
    position: int = Field(default=0)  # lower value = shown earlier in the list


class UserWordProgress(SQLModel, table=True):
    """Tracks how well a specific user knows a specific word.

    Status transitions: new → learning → known
    review_count tracks total answer attempts; last_seen is used to calculate
    the study streak shown on the dashboard.
    """
    __tablename__ = "user_word_progress"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    word_id: int = Field(foreign_key="word.id")
    status: str = Field(default="new")  # new | learning | known
    review_count: int = Field(default=0)
    mistake_count: int = Field(default=0)  # incremented each time user answers this word wrong
    last_seen: datetime = Field(default_factory=_utcnow)


class DailyStudySession(SQLModel, table=True):
    """Tracks how many study sessions a user has started on a given UTC date.
    Used to enforce the daily limit for basic (non-premium) users."""
    __tablename__ = "daily_study_session"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    study_date: date = Field(index=True)
    session_count: int = Field(default=0)


class MistakeReport(SQLModel, table=True):
    """A user-submitted report about a mistake in content (word, translation, grammar task).

    context holds a short string identifying where the mistake was found,
    e.g. 'word:42' or 'grammar:3'. status is 'open' until an admin resolves it.
    """
    __tablename__ = "mistake_report"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    context: Optional[str] = None   # e.g. 'word:42', 'grammar:3'
    description: str = Field(default="", max_length=500)
    status: str = Field(default="open")  # open | resolved
    created_at: datetime = Field(default_factory=_utcnow)


class GrammarSentence(SQLModel, table=True):
    """A fill-in-the-gap sentence exercise loaded from content/grammar/ text files.
    Keyed by case_index (1-14) which matches LESSON_CONFIG in grammar/lessons.py."""
    __tablename__ = "grammar_sentence"
    id: Optional[int] = Field(default=None, primary_key=True)
    case_index: int = Field(index=True)       # 1-14, links to lesson config
    display: str                               # "Laima mato brol___."
    answer_ending: str                         # "į"
    full_word: str                             # "brolį"
    russian: str                               # "Лайма видит брата."
    archived: bool = Field(default=False)      # soft-delete: keep row, hide from exercises


class GrammarCaseRule(SQLModel, table=True):
    """Grammar rule metadata for a Lithuanian case, loaded from content/grammar/ text file headers.
    Keyed by case_index (1-14). Populated by the content loader."""
    __tablename__ = "grammar_case_rule"
    id: Optional[int] = Field(default=None, primary_key=True)
    case_index: int = Field(unique=True, index=True)  # 1-14
    name_ru: str                    # "Винительный (Galininkas)"
    question: str                   # "Кого? Что?"
    usage: str                      # explanation of when to use this case
    endings_sg: str                 # singular endings, e.g. "-ą, -į, -ų"
    endings_pl: str                 # plural endings, e.g. "-us, -ius, -as, -es"
    transform: str                  # transformation rules description


class Article(SQLModel, table=True):
    """A bilingual article (RU + EN) authored or imported by admins.
    Body is stored as Markdown. Seeded from content/articles/*.md files."""
    __tablename__ = "article"
    id: Optional[int] = Field(default=None, primary_key=True)
    slug: str = Field(unique=True, index=True)         # URL-safe identifier
    title_ru: str
    title_en: str
    body_ru: str = Field(default="")                   # Markdown content in Russian
    body_en: str = Field(default="")                   # Markdown content in English
    tags: str = Field(default="")                      # comma-separated tag list
    published: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utcnow)
    updated_at: datetime = Field(default_factory=_utcnow)


class GrammarLessonResult(SQLModel, table=True):
    """Records each completed grammar lesson attempt for a user.

    Used to enforce the >75% progression gate: lesson N is locked until the
    user's best score on lesson N-1 exceeds 75%.
    """
    __tablename__ = "grammar_lesson_result"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    lesson_id: int
    score: int       # number of correct answers
    total: int       # total tasks in the attempt
    passed: bool     # score / total > 0.75
    created_at: datetime = Field(default_factory=_utcnow)
