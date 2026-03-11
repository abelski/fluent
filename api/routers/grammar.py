# Grammar lesson endpoints.
# This router is intentionally thin — all content logic lives in services/grammar_service.py.

from fastapi import APIRouter, HTTPException
from services.grammar_service import get_lessons, get_lesson_tasks

router = APIRouter()


@router.get("/grammar/lessons")
def list_lessons():
    """Return the list of all available grammar lessons with metadata (title, level, case info)."""
    return get_lessons()


@router.get("/grammar/lessons/{lesson_id}/tasks")
def lesson_tasks(lesson_id: int):
    """Return a freshly generated set of tasks for the given lesson.

    Tasks are randomized on every call so students get variety each session.
    Returns 404 if the lesson_id doesn't match any entry in LESSON_CONFIG.
    """
    tasks = get_lesson_tasks(lesson_id)
    if tasks is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return tasks
