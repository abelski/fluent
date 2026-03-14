from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class WordList(SQLModel, table=True):
    """A named collection of words (e.g. "Numbers 1-20", "Animals").
    is_public=True means any user can study it without special access."""
    __tablename__ = "word_list"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: Optional[str] = None
    subcategory: Optional[str] = None
    archived: bool = Field(default=False)
    is_public: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Word(SQLModel, table=True):
    """A single Lithuanian word with translations in both English and Russian.
    Words are shared across lists — the same word can belong to multiple lists."""
    __tablename__ = "word"
    id: Optional[int] = Field(default=None, primary_key=True)
    lithuanian: str
    translation_en: str
    translation_ru: str
    hint: Optional[str] = None  # e.g. "m. / f." or grammatical note


class WordListItem(SQLModel, table=True):
    """Join table between WordList and Word with an explicit ordering position.
    Using a separate join table (vs. a many-to-many relation) allows per-list
    word ordering without duplicating word data."""
    __tablename__ = "word_list_item"
    id: Optional[int] = Field(default=None, primary_key=True)
    word_list_id: int = Field(foreign_key="word_list.id", index=True)
    word_id: int = Field(foreign_key="word.id", index=True)
    position: int = Field(default=0)  # lower value = shown earlier in the list
