import uuid
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    """Registered user. Created on first Google OAuth login, updated on subsequent logins."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    email: str = Field(unique=True, index=True)
    name: str
    picture: Optional[str] = None
    lang: str = Field(default="en")  # preferred UI language: 'en' | 'ru'
    created_at: datetime = Field(default_factory=datetime.utcnow)
