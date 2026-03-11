from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


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
    last_seen: datetime = Field(default_factory=datetime.utcnow)
