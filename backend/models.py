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
    last_login: Optional[datetime] = None
    words_per_session: Optional[int] = None      # total words per session; treated as 10 when null
    new_words_ratio: Optional[float] = None      # fraction of new words (0.0–1.0); treated as 0.7 when null
    lesson_mode: str = Field(default='thorough')  # 'thorough' | 'quick'
    use_question_timer: bool = Field(default=False)  # per-question countdown
    question_timer_seconds: int = Field(default=5)   # countdown duration in seconds (5–30)


class WordList(SQLModel, table=True):
    """A named collection of words (e.g. "Numbers 1-20", "Animals").
    is_public=True means any user can study it without special access."""
    __tablename__ = "word_list"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    title_en: Optional[str] = None       # English translation of the list title
    description: Optional[str] = None
    description_en: Optional[str] = None  # English translation of the description
    subcategory: Optional[str] = None  # parent folder name from content/vocabulary/<subcategory>/
    is_public: bool = Field(default=True)
    created_at: datetime = Field(default_factory=_utcnow)
    archived: bool = Field(default=False)  # soft-delete: hide but preserve FK integrity
    cefr_level: Optional[str] = None     # e.g. "A1", "A1-A2", "B1-B2"
    difficulty: Optional[str] = None     # "easy" | "medium" | "hard"
    article_url: Optional[str] = None    # internal path or external URL
    sort_order: Optional[int] = Field(default=0)  # display order within subcategory


class Feedback(SQLModel, table=True):
    """User-submitted feedback message (anonymous — no auth required)."""
    __tablename__ = "feedback"
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str
    message: str
    created_at: datetime = Field(default_factory=_utcnow)


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
    star: int = Field(default=1)  # complexity: 1=base form, 2=inflected/multi-form, 3=phrase


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
    status: str = Field(default="open")  # open | onhold | resolved
    created_at: datetime = Field(default_factory=_utcnow)


class SubcategoryMeta(SQLModel, table=True):
    """Metadata (CEFR level, difficulty, article link) for a word list subcategory.
    Keyed by the subcategory string (e.g. 'a1_basics', 'everyday')."""
    __tablename__ = "subcategory_meta"
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True)  # matches WordList.subcategory
    cefr_level: Optional[str] = None     # e.g. "A1", "A1-A2", "B1-B2"
    difficulty: Optional[str] = None     # "easy" | "medium" | "hard"
    article_url: Optional[str] = None       # internal path (e.g. /dashboard/articles/slug) or external URL
    article_name_ru: Optional[str] = None  # display label in Russian
    article_name_en: Optional[str] = None  # display label in English
    sort_order: Optional[int] = Field(default=0)  # display order on the lists page
    name_ru: Optional[str] = None  # overrides hardcoded translation key in Russian
    name_en: Optional[str] = None  # overrides hardcoded translation key in English
    status: str = Field(default="draft")  # draft | testing | published
    created_by: Optional[str] = Field(default=None, foreign_key="user.id")  # admin who created


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
    use_in_basic: bool = Field(default=True)    # include in basic lessons
    use_in_advanced: bool = Field(default=True) # include in advanced lessons
    use_in_practice: bool = Field(default=True) # include in practice lessons


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
    status: str = Field(default="testing")  # draft | testing | published (no creator tracking for seeded rules)
    article_slug: Optional[str] = Field(default=None)  # slug of a supporting article for this case


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
    show_in_footer: bool = Field(default=False)        # show in footer nav (hidden from main articles list)
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


class PracticeCategory(SQLModel, table=True):
    """A top-level grouping of practice tests (e.g. 'Constitution', 'History').
    Admins create categories; each category can contain multiple PracticeTests."""
    __tablename__ = "practice_category"
    id: Optional[int] = Field(default=None, primary_key=True)
    name_ru: str
    name_en: Optional[str] = None
    description_ru: Optional[str] = None
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=_utcnow)


class PracticeTest(SQLModel, table=True):
    """A named multiple-choice test (e.g. 'Lithuanian Constitution').
    Admins create and manage tests; each test has its own question pool."""
    __tablename__ = "practice_test"
    id: Optional[int] = Field(default=None, primary_key=True)
    category_id: Optional[int] = Field(default=None, foreign_key="practice_category.id", index=True)
    title_ru: str
    title_en: Optional[str] = None
    description_ru: Optional[str] = None
    description_en: Optional[str] = None
    question_count: int = Field(default=20)       # questions shown per exam session
    pass_threshold: float = Field(default=0.75)   # fraction required to pass (0–1)
    status: str = Field(default="draft")          # draft | testing | published
    is_premium: bool = Field(default=False)       # requires premium subscription
    created_by: Optional[str] = Field(default=None, foreign_key="user.id")  # admin who created
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=_utcnow)


class PracticeQuestion(SQLModel, table=True):
    """A single multiple-choice question belonging to a PracticeTest.
    correct_option is one of: 'a', 'b', 'c', 'd'."""
    __tablename__ = "practice_question"
    id: Optional[int] = Field(default=None, primary_key=True)
    test_id: int = Field(foreign_key="practice_test.id", index=True)
    question_ru: str
    question_lt: Optional[str] = None
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str                     # 'a' | 'b' | 'c' | 'd'
    category: Optional[str] = None
    is_active: bool = Field(default=True)
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=_utcnow)


class PracticeExamResult(SQLModel, table=True):
    """Records a completed practice exam attempt for a user."""
    __tablename__ = "practice_exam_result"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    test_id: int = Field(foreign_key="practice_test.id", index=True)
    score: int
    total: int
    created_at: datetime = Field(default_factory=_utcnow)


class ConstitutionQuestion(SQLModel, table=True):
    """A multiple-choice question about the Lithuanian Constitution.
    Used in the Practice section for citizenship/residency exam preparation.
    correct_option is one of: 'a', 'b', 'c', 'd'."""
    __tablename__ = "constitution_question"
    id: Optional[int] = Field(default=None, primary_key=True)
    question_ru: str                        # question text in Russian
    option_a: str
    option_b: str
    option_c: str
    option_d: str
    correct_option: str                     # 'a' | 'b' | 'c' | 'd'
    category: Optional[str] = None         # e.g. 'structure', 'history', 'rights'
    is_active: bool = Field(default=True)  # False = hidden from exams
    sort_order: int = Field(default=0)
    created_at: datetime = Field(default_factory=_utcnow)


class ConstitutionExamResult(SQLModel, table=True):
    """Records a completed constitution exam attempt for a user."""
    __tablename__ = "constitution_exam_result"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    score: int       # number of correct answers
    total: int       # total questions in the attempt
    created_at: datetime = Field(default_factory=_utcnow)


class NewsPost(SQLModel, table=True):
    """An admin-authored news post displayed on the landing page.
    Supports bilingual content (RU + EN). published_at controls sort order."""
    __tablename__ = "news_post"
    id: Optional[int] = Field(default=None, primary_key=True)
    title_ru: str
    title_en: str
    body_ru: str = Field(default="")
    body_en: str = Field(default="")
    published_at: datetime = Field(default_factory=_utcnow)
    created_at: datetime = Field(default_factory=_utcnow)
    published: bool = Field(default=True)


class AppSetting(SQLModel, table=True):
    """Generic app-wide key-value settings store. Values are JSON strings."""
    __tablename__ = "app_setting"
    id: Optional[int] = Field(default=None, primary_key=True)
    key: str = Field(unique=True, index=True)
    value: str  # JSON-encoded value


class UserProgram(SQLModel, table=True):
    """Tracks which programs (subcategory groups) a user has enrolled in.
    A program corresponds to a SubcategoryMeta key (e.g. 'a1_basics').
    Only enrolled programs' card stacks appear on /dashboard/lists."""
    __tablename__ = "user_program"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    subcategory_key: str = Field(index=True)  # matches SubcategoryMeta.key
    enrolled_at: datetime = Field(default_factory=_utcnow)
