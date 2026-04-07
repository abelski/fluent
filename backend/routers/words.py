# Word lists and vocabulary study endpoints.
# Handles browsing lists, fetching study sessions, and recording per-word progress.

import random
from datetime import datetime, timedelta, timezone
from typing import Optional, Literal

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel
from sqlmodel import Session, select, col, func

from database import get_session
from models import User, Word, WordList, WordListItem, UserWordProgress, DailyStudySession, SubcategoryMeta, GrammarLessonResult, PracticeExamResult, UserProgram
from constants import DAILY_LIMIT
from auth import require_user as _require_user, try_get_user as _try_get_user
from quota import is_premium_active as _is_premium_active, quota_check_and_increment as _quota_check_and_increment

router = APIRouter()


def _list_words(list_id: int, session: Session) -> list[dict]:
    """Fetch all active (non-archived) words in a list ordered by their position."""
    rows = session.exec(
        select(Word)
        .join(WordListItem, WordListItem.word_id == Word.id)
        .where(WordListItem.word_list_id == list_id)
        .where(Word.archived == False)  # noqa: E712
        .order_by(WordListItem.position)
    ).all()
    return [
        {
            "id": w.id,
            "lithuanian": w.lithuanian,
            "translation_en": w.translation_en,
            "translation_ru": w.translation_ru,
            "hint": w.hint,
            "star": w.star,
        }
        for w in rows
    ]


@router.get("/subcategory-meta")
def get_subcategory_meta(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return CEFR/difficulty/article metadata keyed by subcategory string.
    Includes enrollment_count (number of distinct users enrolled in each program).
    Admins receive is_published/status/created_by fields."""
    user = _try_get_user(authorization, session)
    is_admin = user is not None and user.is_admin
    rows = session.exec(select(SubcategoryMeta)).all()

    # One aggregation query: distinct user count per subcategory
    enrollment_rows = session.exec(
        select(UserProgram.subcategory_key, func.count(func.distinct(UserProgram.user_id)))
        .group_by(UserProgram.subcategory_key)
    ).all()
    enrollment_counts: dict[str, int] = {key: cnt for key, cnt in enrollment_rows}

    return {
        r.key: {
            "cefr_level": r.cefr_level,
            "difficulty": r.difficulty,
            "article_url": r.article_url,
            "article_name_ru": r.article_name_ru,
            "article_name_en": r.article_name_en,
            "name_ru": r.name_ru,
            "name_en": r.name_en,
            "enrollment_count": enrollment_counts.get(r.key, 0),
            **({"status": r.status, "created_by": r.created_by} if is_admin else {}),
        }
        for r in rows
    }


@router.get("/lists")
def get_lists(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all public word lists ordered by subcategory sort_order then list sort_order.
    Non-admins only see lists from published subcategories.
    Word counts are fetched in a single aggregation query to avoid N+1."""
    user = _try_get_user(authorization, session)
    is_admin = user is not None and user.is_admin

    lists = session.exec(
        select(WordList).where(WordList.is_public == True, WordList.archived == False)  # noqa: E712
    ).all()
    # Single aggregation query to get word counts for all lists at once
    counts = dict(
        session.exec(
            select(WordListItem.word_list_id, func.count(WordListItem.id))
            .group_by(WordListItem.word_list_id)
        ).all()
    )
    # Per-star counts: group by (word_list_id, star) to compute cumulative star_counts
    _star_rows = session.exec(
        select(WordListItem.word_list_id, Word.star, func.count(WordListItem.id))
        .join(Word, WordListItem.word_id == Word.id)
        .where(Word.archived == False)  # noqa: E712
        .group_by(WordListItem.word_list_id, Word.star)
    ).all()
    # Build cumulative counts: star_counts[list_id][N] = # words with star <= N
    _star_by_list: dict[int, dict[int, int]] = {}
    for list_id, star, cnt in _star_rows:
        _star_by_list.setdefault(list_id, {})
        _star_by_list[list_id][star] = _star_by_list[list_id].get(star, 0) + cnt
    star_counts_map: dict[int, dict[str, int]] = {}
    for list_id, by_star in _star_by_list.items():
        cumulative = 0
        star_counts_map[list_id] = {}
        for level in (1, 2, 3):
            cumulative += by_star.get(level, 0)
            star_counts_map[list_id][str(level)] = cumulative
    # Load subcategory metadata for ordering and status filtering
    meta_rows = session.exec(select(SubcategoryMeta)).all()
    subcat_order = {r.key: (r.sort_order or 0) for r in meta_rows}
    meta_map = {r.key: r for r in meta_rows}

    user_id = user.id if user else None

    def _subcat_visible(subcat: Optional[str]) -> bool:
        key = subcat or ""
        if key not in meta_map:
            return is_admin  # subcategories without metadata only visible to admins
        row = meta_map[key]
        if row.status == "published":
            return True
        if is_admin and row.status == "testing":
            return True
        if is_admin and row.status == "draft" and row.created_by == user_id:
            return True
        return False

    lists = [wl for wl in lists if _subcat_visible(wl.subcategory)]

    sorted_lists = sorted(
        lists,
        key=lambda wl: (subcat_order.get(wl.subcategory or "", 9999), wl.sort_order or 0, wl.id or 0),
    )
    return [
        {
            "id": wl.id,
            "title": wl.title,
            "title_en": wl.title_en,
            "description": wl.description,
            "description_en": wl.description_en,
            "subcategory": wl.subcategory,
            "word_count": counts.get(wl.id, 0),
            "star_counts": star_counts_map.get(wl.id, {"1": 0, "2": 0, "3": 0}),
        }
        for wl in sorted_lists
    ]


@router.get("/lists/{list_id}")
def get_list(list_id: int, session: Session = Depends(get_session)):
    """Return a single list with all its words. Used on the list detail page."""
    wl = session.get(WordList, list_id)
    if not wl or wl.archived:
        raise HTTPException(status_code=404, detail="List not found")
    return {
        "id": wl.id,
        "title": wl.title,
        "title_en": wl.title_en,
        "description": wl.description,
        "description_en": wl.description_en,
        "words": _list_words(list_id, session),
    }


# Session sizing defaults (used both in study endpoint and settings endpoints)
QUIZ_SIZE = 10           # legacy constant kept for review endpoints
DEFAULT_SESSION_SIZE = 10
DEFAULT_NEW_RATIO = 0.7  # 70% new words, 30% review



@router.get("/lists/{list_id}/study")
def get_study_words(
    list_id: int,
    star_level: int = Query(default=1, ge=1, le=3),
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return a prioritized set of words plus MCQ distractors for a study session.

    star_level filters which words are included:
      1 = only star=1 words, 2 = star<=2 words, 3 = all words.

    Response: { "words": [...], "distractors": [...] }
    - words: the session queue, ordered new → learning → known, limited by user settings
    - distractors: up to 12 extra words from other lists for building MCQ options

    Session sizing (authenticated users):
      total = user.words_per_session or DEFAULT_SESSION_SIZE
      new_ratio = user.new_words_ratio or DEFAULT_NEW_RATIO
      new_count = round(total * new_ratio), review_count = total - new_count
      Gaps are filled: if not enough new words, extra slots go to review and vice versa.

    For anonymous users: all words (up to DEFAULT_SESSION_SIZE), shuffled.
    """
    wl = session.get(WordList, list_id)
    if not wl or wl.archived:
        raise HTTPException(status_code=404, detail="List not found")

    all_words = _list_words(list_id, session)

    # Filter by complexity level
    all_words = [w for w in all_words if w["star"] <= star_level]

    # Try to get authenticated user for progress-based prioritization.
    # Auth is optional here — unauthenticated users still get a study session.
    user = _try_get_user(authorization, session)

    if user:
        _quota_check_and_increment(user, session)

    if user and all_words:
        word_ids = [w["id"] for w in all_words]
        progress_records = session.exec(
            select(UserWordProgress).where(
                UserWordProgress.user_id == user.id,
                col(UserWordProgress.word_id).in_(word_ids),
            )
        ).all()
        progress_map = {p.word_id: p.status for p in progress_records}

        for w in all_words:
            w["status"] = progress_map.get(w["id"], "new")

        new_words = [w for w in all_words if w["status"] == "new"]
        learning_words = [w for w in all_words if w["status"] == "learning"]
        known_words = [w for w in all_words if w["status"] == "known"]
        random.shuffle(known_words)
        review_words = learning_words + known_words

        total = user.words_per_session if user.words_per_session is not None else DEFAULT_SESSION_SIZE
        new_ratio = user.new_words_ratio if user.new_words_ratio is not None else DEFAULT_NEW_RATIO
        new_count = round(total * new_ratio)
        review_count = total - new_count

        # Fill gaps: if fewer new words than requested, use extra review slots and vice versa
        actual_new = min(len(new_words), new_count)
        new_gap = new_count - actual_new  # unused new slots
        actual_review = min(len(review_words), review_count + new_gap)

        review_gap = review_count - min(len(review_words), review_count)
        actual_new = min(len(new_words), new_count + review_gap)

        session_words = new_words[:actual_new] + review_words[:actual_review]
    else:
        for w in all_words:
            w["status"] = "new"
        session_words = all_words[:DEFAULT_SESSION_SIZE]

    # Fetch distractors: random words from other lists for MCQ options.
    # Exclude words already in the session so MCQ options don't overlap with answers.
    session_word_ids = {w["id"] for w in session_words}
    distractor_rows = session.exec(
        select(Word)
        .join(WordListItem, WordListItem.word_id == Word.id)
        .where(
            WordListItem.word_list_id != list_id,
            Word.archived == False,  # noqa: E712
            col(Word.id).not_in(list(session_word_ids)) if session_word_ids else True,
        )
        .order_by(func.random())
        .limit(12)
    ).all()
    distractors = [
        {
            "id": w.id,
            "lithuanian": w.lithuanian,
            "translation_en": w.translation_en,
            "translation_ru": w.translation_ru,
            "hint": w.hint,
            "status": "new",
        }
        for w in distractor_rows
    ]

    return {"words": session_words, "distractors": distractors}


@router.get("/lists/{list_id}/progress")
def get_list_progress(
    list_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the authenticated user's progress breakdown for a single list.
    Used to show the progress bar on the list detail page."""
    wl = session.get(WordList, list_id)
    if not wl or wl.archived:
        raise HTTPException(status_code=404, detail="List not found")
    user = _require_user(authorization, session)
    word_ids = [w["id"] for w in _list_words(list_id, session)]
    progress_records = session.exec(
        select(UserWordProgress).where(
            UserWordProgress.user_id == user.id,
            col(UserWordProgress.word_id).in_(word_ids),
        )
    ).all()
    status_map = {p.word_id: p.status for p in progress_records}
    known = sum(1 for wid in word_ids if status_map.get(wid) == "known")
    learning = sum(1 for wid in word_ids if status_map.get(wid) == "learning")
    return {
        "total": len(word_ids),
        "known": known,
        "learning": learning,
        "new": len(word_ids) - known - learning,
    }


class UserSettingsUpdate(BaseModel):
    words_per_session: int
    new_words_ratio: float
    lesson_mode: str = 'thorough'
    use_question_timer: bool = False
    question_timer_seconds: int = 5


@router.get("/me/settings")
def get_user_settings(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the current user's study session size settings."""
    user = _require_user(authorization, session)
    return {
        "words_per_session": user.words_per_session if user.words_per_session is not None else DEFAULT_SESSION_SIZE,
        "new_words_ratio": user.new_words_ratio if user.new_words_ratio is not None else DEFAULT_NEW_RATIO,
        "lesson_mode": user.lesson_mode,
        "use_question_timer": user.use_question_timer,
        "question_timer_seconds": user.question_timer_seconds,
    }


@router.patch("/me/settings")
def update_user_settings(
    body: UserSettingsUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update the current user's study session size settings."""
    user = _require_user(authorization, session)
    if not (1 <= body.words_per_session <= 50):
        raise HTTPException(status_code=422, detail="words_per_session must be between 1 and 50")
    if not (0.0 <= body.new_words_ratio <= 1.0):
        raise HTTPException(status_code=422, detail="new_words_ratio must be between 0.0 and 1.0")
    if body.lesson_mode not in ('thorough', 'quick'):
        raise HTTPException(status_code=422, detail="lesson_mode must be 'thorough' or 'quick'")
    if not (5 <= body.question_timer_seconds <= 30):
        raise HTTPException(status_code=422, detail="question_timer_seconds must be between 5 and 30")
    user.words_per_session = body.words_per_session
    user.new_words_ratio = body.new_words_ratio
    user.lesson_mode = body.lesson_mode
    user.use_question_timer = body.use_question_timer
    user.question_timer_seconds = body.question_timer_seconds
    session.add(user)
    session.commit()
    return {
        "words_per_session": user.words_per_session,
        "new_words_ratio": user.new_words_ratio,
        "lesson_mode": user.lesson_mode,
        "use_question_timer": user.use_question_timer,
        "question_timer_seconds": user.question_timer_seconds,
    }


class ProgressUpdate(BaseModel):
    status: Literal["learning", "known"]
    mistake: bool = False       # True when the user answered this word incorrectly
    clear_mistake: bool = False  # True to reset mistake_count to 0 (word mastered in review)


@router.post("/words/{word_id}/progress")
def update_progress(
    word_id: int,
    body: ProgressUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Record the user's answer for a word during a study session.

    Called after each card flip. Upserts the UserWordProgress row —
    creates it on first answer, increments review_count on subsequent ones.
    When mistake=True, also increments mistake_count.
    """
    user = _require_user(authorization, session)
    progress = session.exec(
        select(UserWordProgress).where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.word_id == word_id,
        )
    ).first()
    if progress:
        progress.status = body.status
        progress.review_count += 1
        if body.mistake:
            progress.mistake_count += 1
        elif body.clear_mistake:
            progress.mistake_count = 0
        progress.last_seen = datetime.now(timezone.utc).replace(tzinfo=None)
    else:
        progress = UserWordProgress(
            user_id=user.id,
            word_id=word_id,
            status=body.status,
            review_count=1,
            mistake_count=1 if body.mistake else 0,
        )
        session.add(progress)
    session.commit()
    return {"ok": True}



def _word_to_dict(w: Word, status: str) -> dict:
    return {
        "id": w.id,
        "lithuanian": w.lithuanian,
        "translation_en": w.translation_en,
        "translation_ru": w.translation_ru,
        "hint": w.hint,
        "status": status,
    }


@router.get("/review/known")
def get_review_known(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return up to 10 known words for a refresh session, oldest-reviewed first.

    Words are ordered by last_seen ASC so the user revisits words they studied
    longest ago first (spaced-repetition-like ordering).
    Counts against the daily session quota same as regular study.
    """
    user = _require_user(authorization, session)
    _quota_check_and_increment(user, session)

    progress_records = session.exec(
        select(UserWordProgress)
        .where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.status == "known",
        )
        .order_by(UserWordProgress.last_seen)
        .limit(QUIZ_SIZE)
    ).all()

    if not progress_records:
        return []

    word_ids = [p.word_id for p in progress_records]
    words = session.exec(
        select(Word).where(col(Word.id).in_(word_ids), Word.archived == False)  # noqa: E712
    ).all()
    word_map = {w.id: w for w in words}

    return [
        _word_to_dict(word_map[p.word_id], p.status)
        for p in progress_records
        if p.word_id in word_map
    ]


@router.get("/review/mistakes")
def get_review_mistakes(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return up to 10 words the user has answered wrong, most-mistaken first.

    Counts against the daily session quota same as regular study.
    """
    user = _require_user(authorization, session)
    _quota_check_and_increment(user, session)

    progress_records = session.exec(
        select(UserWordProgress)
        .where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.mistake_count > 0,
        )
        .order_by(col(UserWordProgress.mistake_count).desc())
        .limit(QUIZ_SIZE)
    ).all()

    if not progress_records:
        return []

    word_ids = [p.word_id for p in progress_records]
    words = session.exec(
        select(Word).where(col(Word.id).in_(word_ids), Word.archived == False)  # noqa: E712
    ).all()
    word_map = {w.id: w for w in words}

    return [
        _word_to_dict(word_map[p.word_id], p.status)
        for p in progress_records
        if p.word_id in word_map
    ]


@router.get("/me/lists-progress")
def get_all_lists_progress(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return progress stats for all public lists in a single response.

    Optimized to use only 2 DB queries regardless of how many lists exist:
      1. Fetch all (list_id, word_id) pairs for public lists
      2. Fetch all progress records for this user
    Then aggregate counts in Python.
    """
    user = _require_user(authorization, session)

    # One query: all public list IDs + their word IDs
    rows = session.exec(
        select(WordListItem.word_list_id, WordListItem.word_id)
        .join(WordList, WordList.id == WordListItem.word_list_id)
        .where(WordList.is_public == True)
    ).all()

    # Group word IDs by list and collect the full set for the progress query
    list_word_ids: dict[int, list[int]] = {}
    all_word_ids: set[int] = set()
    for list_id, word_id in rows:
        list_word_ids.setdefault(list_id, []).append(word_id)
        all_word_ids.add(word_id)

    progress_records = session.exec(
        select(UserWordProgress).where(
            UserWordProgress.user_id == user.id,
            col(UserWordProgress.word_id).in_(list(all_word_ids)),
        )
    ).all() if all_word_ids else []
    status_map = {p.word_id: p.status for p in progress_records}

    result = {}
    for list_id, word_ids in list_word_ids.items():
        known = sum(1 for wid in word_ids if status_map.get(wid) == "known")
        learning = sum(1 for wid in word_ids if status_map.get(wid) == "learning")
        result[list_id] = {
            "total": len(word_ids),
            "known": known,
            "learning": learning,
            "new": len(word_ids) - known - learning,
        }
    return result


@router.get("/me/stats")
def get_stats(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return overall stats for the dashboard header: known/learning counts and study streak.

    The streak counts consecutive days on which the user studied at least one word,
    by looking at the set of unique dates in UserWordProgress.last_seen.
    """
    user = _require_user(authorization, session)
    all_progress = session.exec(
        select(UserWordProgress).where(UserWordProgress.user_id == user.id)
    ).all()
    known = sum(1 for p in all_progress if p.status == "known")
    learning = sum(1 for p in all_progress if p.status == "learning")
    mistakes = sum(1 for p in all_progress if p.mistake_count > 0)

    # Build a set of unique study dates, then count backwards from today
    studied_dates = {p.last_seen.date() for p in all_progress}
    today = datetime.now(timezone.utc).date()
    streak = 0
    # Start from today; if today wasn't a study day, check yesterday before giving up
    check = today if today in studied_dates else today - timedelta(days=1)
    while check in studied_dates:
        streak += 1
        check -= timedelta(days=1)

    # Grammar: count distinct lessons passed (best score > 75%)
    grammar_results = session.exec(
        select(GrammarLessonResult).where(GrammarLessonResult.user_id == user.id)
    ).all()
    best_grammar: dict[int, float] = {}
    for r in grammar_results:
        pct = r.score / r.total if r.total > 0 else 0.0
        if r.lesson_id not in best_grammar or pct > best_grammar[r.lesson_id]:
            best_grammar[r.lesson_id] = pct
    grammar_lessons_passed = sum(1 for pct in best_grammar.values() if pct > 0.75)

    # Practice: count completed exam attempts
    practice_results = session.exec(
        select(PracticeExamResult).where(PracticeExamResult.user_id == user.id)
    ).all()
    practice_exams_completed = len(practice_results)

    return {
        "known": known,
        "learning": learning,
        "total_studied": known + learning,
        "streak": streak,
        "mistakes": mistakes,
        "grammar_lessons_passed": grammar_lessons_passed,
        "practice_exams_completed": practice_exams_completed,
    }


@router.get("/me/known-words")
def get_known_words(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all words the user has learned (status='known'), ordered by last_seen DESC.

    Each word includes the title of the first list it belongs to (if any)
    so the frontend can group or label words by topic.
    """
    user = _require_user(authorization, session)

    progress_records = session.exec(
        select(UserWordProgress)
        .where(
            UserWordProgress.user_id == user.id,
            UserWordProgress.status == "known",
        )
        .order_by(col(UserWordProgress.last_seen).desc())
    ).all()

    if not progress_records:
        return []

    word_ids = [p.word_id for p in progress_records]
    words = session.exec(
        select(Word).where(col(Word.id).in_(word_ids), Word.archived == False)  # noqa: E712
    ).all()
    word_map = {w.id: w for w in words}

    # One query to get a list title per word (use the first list found)
    list_rows = session.exec(
        select(WordListItem.word_id, WordList.title, WordList.title_en, WordList.id)
        .join(WordList, WordList.id == WordListItem.word_list_id)
        .where(col(WordListItem.word_id).in_(word_ids))
    ).all()
    list_title_map: dict[int, tuple[str, str | None, int]] = {}
    for wid, title, title_en, list_id in list_rows:
        if wid not in list_title_map:
            list_title_map[wid] = (title, title_en, list_id)

    result = []
    for p in progress_records:
        w = word_map.get(p.word_id)
        if not w:
            continue
        list_info = list_title_map.get(p.word_id)
        result.append({
            "id": w.id,
            "lithuanian": w.lithuanian,
            "translation_ru": w.translation_ru,
            "translation_en": w.translation_en,
            "hint": w.hint,
            "last_seen": p.last_seen.isoformat() if p.last_seen else None,
            "list_title": list_info[0] if list_info else None,
            "list_title_en": list_info[1] if list_info else None,
            "list_id": list_info[2] if list_info else None,
        })
    return result


@router.get("/me/quota")
def get_quota(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the current user's tier and daily session usage."""
    user = _require_user(authorization, session)
    premium_active = _is_premium_active(user)
    today = datetime.now(timezone.utc).date()
    row = session.exec(
        select(DailyStudySession).where(
            DailyStudySession.user_id == user.id,
            DailyStudySession.study_date == today,
        )
    ).first()
    sessions_today = row.session_count if row else 0
    return {
        "is_premium": user.is_premium,
        "premium_until": user.premium_until,
        "premium_active": premium_active,
        "sessions_today": sessions_today,
        "daily_limit": None if premium_active else DAILY_LIMIT,
        "is_admin": user.is_admin,
        "is_superadmin": user.is_superadmin,
    }


# ── Program enrollment ──────────────────────────────────────────────────────

class EnrollBody(BaseModel):
    subcategory: str  # matches SubcategoryMeta.key


@router.get("/me/programs")
def get_enrolled_programs(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the subcategory keys the current user has enrolled in."""
    user = _require_user(authorization, session)
    rows = session.exec(
        select(UserProgram).where(UserProgram.user_id == user.id)
    ).all()
    return [r.subcategory_key for r in rows]


@router.post("/me/programs", status_code=201)
def enroll_program(
    body: EnrollBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Enroll the current user in a program (subcategory). Returns 400 if already enrolled."""
    user = _require_user(authorization, session)
    meta = session.exec(
        select(SubcategoryMeta).where(SubcategoryMeta.key == body.subcategory)
    ).first()
    if not meta:
        raise HTTPException(status_code=404, detail="Program not found")
    existing = session.exec(
        select(UserProgram).where(
            UserProgram.user_id == user.id,
            UserProgram.subcategory_key == body.subcategory,
        )
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Already enrolled")
    enrollment = UserProgram(user_id=user.id, subcategory_key=body.subcategory)
    session.add(enrollment)
    session.commit()
    return {"ok": True, "subcategory": body.subcategory}


@router.delete("/me/programs/{subcategory}", status_code=200)
def unenroll_program(
    subcategory: str,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Remove the current user's enrollment in a program. Returns 404 if not enrolled."""
    user = _require_user(authorization, session)
    existing = session.exec(
        select(UserProgram).where(
            UserProgram.user_id == user.id,
            UserProgram.subcategory_key == subcategory,
        )
    ).first()
    if not existing:
        raise HTTPException(status_code=404, detail="Not enrolled in this program")
    session.delete(existing)
    session.commit()
    return {"ok": True}
