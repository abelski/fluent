# Re-export all models so callers can do: from models import User, Word, ...
# Importing here also ensures all table classes are registered with
# SQLModel.metadata before create_db_and_tables() is called.

from .user import User
from .word import Word, WordList, WordListItem
from .progress import UserWordProgress

__all__ = ["User", "Word", "WordList", "WordListItem", "UserWordProgress"]
