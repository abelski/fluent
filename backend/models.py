import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    email: str = Field(unique=True, index=True)
    name: str
    picture: Optional[str] = None
    lang: str = Field(default="en")  # preferred UI language: 'en' | 'ru'
    created_at: datetime = Field(default_factory=datetime.utcnow)


class WordList(SQLModel, table=True):
    __tablename__ = "word_list"
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    description: Optional[str] = None
    is_public: bool = Field(default=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Word(SQLModel, table=True):
    __tablename__ = "word"
    id: Optional[int] = Field(default=None, primary_key=True)
    lithuanian: str
    translation_en: str
    translation_ru: str
    hint: Optional[str] = None  # e.g. "m. / f." or grammatical note


class WordListItem(SQLModel, table=True):
    __tablename__ = "word_list_item"
    id: Optional[int] = Field(default=None, primary_key=True)
    word_list_id: int = Field(foreign_key="word_list.id", index=True)
    word_id: int = Field(foreign_key="word.id")
    position: int = Field(default=0)


class UserWordProgress(SQLModel, table=True):
    __tablename__ = "user_word_progress"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    word_id: int = Field(foreign_key="word.id")
    status: str = Field(default="new")  # new | learning | known
    review_count: int = Field(default=0)
    last_seen: datetime = Field(default_factory=datetime.utcnow)
