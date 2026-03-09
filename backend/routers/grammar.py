from fastapi import APIRouter, HTTPException
from grammar_data import get_lessons, get_lesson_tasks

router = APIRouter()


@router.get("/grammar/lessons")
def list_lessons():
    return get_lessons()


@router.get("/grammar/lessons/{lesson_id}/tasks")
def lesson_tasks(lesson_id: int):
    tasks = get_lesson_tasks(lesson_id)
    if tasks is None:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return tasks
