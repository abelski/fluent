from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


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
    created_at: datetime = Field(default_factory=datetime.utcnow)
