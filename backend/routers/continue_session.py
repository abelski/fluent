# Combined "Продолжить занятие" session endpoint.
#
# The green continue-CTA on the logged-in home starts ONE session that runs three
# phases back-to-back: words → grammar → phrases. Everything the client needs for
# all three phases is assembled here in a single request, because the whole
# combined session must cost the non-premium user exactly ONE daily-quota unit.
#
# Quota rules (deliberate, see plan_continue-session-rework.md):
#   - charged exactly once, here, server-side — never trusted from the client;
#   - charged only when at least one phase actually has content (mirrors the
#     no-charge-when-empty branch of /lists/{id}/study);
#   - never charged when the enrollment gate below blocks the session;
#   - the per-phase endpoints the client already uses (/review/known,
#     /phrases/review) are NOT called during this flow, so nothing double-charges.
#
# Enrollment gate (deliberate, see plan_continue-training-enrollment-and-settings.md):
# combined training is a *combined* product — if the user is enrolled in nothing for
# any one of words/grammar/phrases, the whole session refuses to start and names the
# missing categories instead of silently degrading to a 1- or 2-phase session. This is
# a hard gate: no skip-and-continue option, and it runs before any content is computed.
#
# Phase sizes and the include-new toggle come from the user's own saved settings
# (GET/PATCH /me/continue-settings) — never sent by the client.

import random
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, col, select

from auth import require_user as _require_user
from database import get_session
from grammar_service import get_lesson_tasks, get_lessons
from models import (
    GrammarLessonResult,
    Phrase,
    User,
    UserGrammarProgram,
    UserPhraseProgramEnrollment,
    UserPhraseProgress,
    UserProgram,
    UserWordProgress,
    Word,
    WordList,
    WordListItem,
)
from quota import quota_check_and_increment as _quota_check_and_increment
from routers.grammar import _annotate_lesson_progress
from routers.phrases import (
    DEFAULT_NEW_PHRASES_RATIO,
    _due_phrases_for_review,
    _serialize_phrase_batch,
)
from routers.words import (
    DEFAULT_NEW_RATIO,
    SESSION_OVERFETCH,
    _dedupe_by_translation,
    _known_due_words,
    _word_to_dict,
)

router = APIRouter()

# Each phase is a short refresher, not a full session. The size is the user's own
# setting; these are the fallback and the server-side bounds for it.
DEFAULT_CONTINUE_COUNT = 3
MIN_CONTINUE_COUNT = 1
MAX_CONTINUE_COUNT = 20

# Extra unseen phrases fetched beyond the phase's own slots, purely so the stage-1
# MCQ options have a word pool to draw from (see _serialize_phrase_batch).
PHRASE_DISTRACTOR_SLACK = 20

# The three categories the enrollment gate covers, in phase order.
ENROLLMENT_CATEGORIES = ("words", "grammar", "phrases")


# ── Settings (GET/PATCH /me/continue-settings) ───────────────────────────────

class ContinueSettingsUpdate(BaseModel):
    continue_words_count: int
    continue_grammar_count: int
    continue_phrases_count: int
    continue_include_new: bool = True


def _count(value: Optional[int]) -> int:
    """A stored per-phase count, or the default when the user never set one."""
    return value if value is not None else DEFAULT_CONTINUE_COUNT


def _continue_settings(user: User) -> dict:
    return {
        "continue_words_count": _count(user.continue_words_count),
        "continue_grammar_count": _count(user.continue_grammar_count),
        "continue_phrases_count": _count(user.continue_phrases_count),
        "continue_include_new": user.continue_include_new,
    }


@router.get("/me/continue-settings")
def get_continue_settings(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the current user's combined-training settings."""
    user = _require_user(authorization, session)
    return _continue_settings(user)


@router.patch("/me/continue-settings")
def update_continue_settings(
    body: ContinueSettingsUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update the current user's combined-training settings.

    Counts are validated here, server-side only — the session endpoint reads them
    back from the user row and never accepts a size from the client.
    """
    user = _require_user(authorization, session)
    for field in ("continue_words_count", "continue_grammar_count", "continue_phrases_count"):
        value = getattr(body, field)
        if not (MIN_CONTINUE_COUNT <= value <= MAX_CONTINUE_COUNT):
            raise HTTPException(
                status_code=422,
                detail=f"{field} must be between {MIN_CONTINUE_COUNT} and {MAX_CONTINUE_COUNT}",
            )
    user.continue_words_count = body.continue_words_count
    user.continue_grammar_count = body.continue_grammar_count
    user.continue_phrases_count = body.continue_phrases_count
    user.continue_include_new = body.continue_include_new
    session.add(user)
    session.commit()
    return _continue_settings(user)


# ── Enrollment gate ──────────────────────────────────────────────────────────

def _enrollment_gaps(user: User, session: Session) -> list[str]:
    """Return which of "words" / "grammar" / "phrases" the user is enrolled in nothing for.

    One row is enough for a category to count as enrolled — this asks "has the user
    ever picked a program here?", not "is there content due?". An empty list means the
    combined session may run.
    """
    gaps: list[str] = []
    if not session.exec(
        select(UserProgram.id).where(UserProgram.user_id == user.id).limit(1)
    ).first():
        gaps.append("words")
    if not session.exec(
        select(UserGrammarProgram.id).where(UserGrammarProgram.user_id == user.id).limit(1)
    ).first():
        gaps.append("grammar")
    if not session.exec(
        select(UserPhraseProgramEnrollment.id)
        .where(UserPhraseProgramEnrollment.user_id == user.id)
        .limit(1)
    ).first():
        gaps.append("phrases")
    return gaps


# ── "New" (never-seen) content pools ─────────────────────────────────────────

def _new_words_pool(user: User, session: Session, limit: Optional[int] = None) -> list[Word]:
    """Words the user has never answered, from the lists of their enrolled programs.

    "New" means no UserWordProgress row at all for this user. Sourced from the
    user's own enrolled programs (UserProgram.subcategory_key → WordList.subcategory),
    never the whole public catalogue.
    """
    enrolled_keys = list(session.exec(
        select(UserProgram.subcategory_key).where(UserProgram.user_id == user.id)
    ).all())
    if not enrolled_keys:
        return []

    enrolled_word_ids = (
        select(WordListItem.word_id)
        .join(WordList, WordList.id == WordListItem.word_list_id)
        .where(
            WordList.is_public == True,  # noqa: E712 — never leak private/personal words
            WordList.archived == False,  # noqa: E712
            col(WordList.subcategory).in_(enrolled_keys),
        )
    )
    seen_word_ids = select(UserWordProgress.word_id).where(UserWordProgress.user_id == user.id)

    query = (
        select(Word)
        .where(
            col(Word.id).in_(enrolled_word_ids),
            col(Word.id).not_in(seen_word_ids),
            Word.archived == False,  # noqa: E712
        )
        .order_by(Word.id)
    )
    if limit is not None:
        query = query.limit(limit)
    return list(session.exec(query).all())


def _new_phrases_pool(user: User, session: Session, limit: Optional[int] = None) -> list[Phrase]:
    """Phrases the user has never seen, from the phrase programs they are enrolled in.

    "New" means no UserPhraseProgress row at all for this user.
    """
    program_ids = list(session.exec(
        select(UserPhraseProgramEnrollment.program_id)
        .where(UserPhraseProgramEnrollment.user_id == user.id)
    ).all())
    if not program_ids:
        return []

    seen_phrase_ids = select(UserPhraseProgress.phrase_id).where(
        UserPhraseProgress.user_id == user.id
    )
    query = (
        select(Phrase)
        .where(
            col(Phrase.program_id).in_(program_ids),
            col(Phrase.id).not_in(seen_phrase_ids),
        )
        .order_by(Phrase.program_id, Phrase.position)
    )
    if limit is not None:
        query = query.limit(limit)
    return list(session.exec(query).all())


def _split_counts(count: int, ratio: float, new_available: int, review_available: int) -> tuple[int, int]:
    """Split `count` slots into (new, review), filling each gap from the other pool.

    Same rule as GET /lists/{id}/study and GET /phrase-programs/{id}/study: the
    shortfall of one pool is offered to the other, so a phase is never shorter than
    it needs to be just because one side ran dry.
    """
    new_count = round(count * ratio)
    review_count = count - new_count
    review_gap = review_count - min(review_available, review_count)
    new_gap = new_count - min(new_available, new_count)
    return (
        min(new_available, new_count + review_gap),
        min(review_available, review_count + new_gap),
    )


# ── Phases ───────────────────────────────────────────────────────────────────

def _words_phase(user: User, session: Session, count: int, include_new: bool) -> list[dict]:
    """Known words due for review, optionally blended with never-seen words.

    Both pools are over-fetched and the *combined* list is de-duplicated on translation
    before the new/review split is applied — a new word and a due word meaning the same
    thing would otherwise slip past `_known_due_words`' own per-pool de-duplication and
    still meet inside one phase.
    """
    if count <= 0:
        return []
    if not include_new:
        return _known_due_words(user, session, count)

    review = _known_due_words(user, session, count * SESSION_OVERFETCH)
    new_pool = _new_words_pool(user, session, limit=count * SESSION_OVERFETCH)
    merged = _dedupe_by_translation(
        [_word_to_dict(word, "new") for word in new_pool] + review
    )
    deduped_new = [w for w in merged if w["status"] == "new"]
    deduped_review = [w for w in merged if w["status"] != "new"]

    ratio = user.new_words_ratio if user.new_words_ratio is not None else DEFAULT_NEW_RATIO
    take_new, take_review = _split_counts(count, ratio, len(deduped_new), len(deduped_review))
    # New first, then review — mirrors GET /lists/{id}/study's own ordering.
    return deduped_new[:take_new] + deduped_review[:take_review]


def _phrases_phase(user: User, session: Session, count: int, include_new: bool) -> list[dict]:
    """Phrases due for review, optionally blended with never-seen phrases."""
    if count <= 0:
        return []
    review = _due_phrases_for_review(user, session, count)
    if not include_new:
        return review

    new_pool = _new_phrases_pool(user, session, limit=count + PHRASE_DISTRACTOR_SLACK)
    ratio = user.new_phrases_ratio if user.new_phrases_ratio is not None else DEFAULT_NEW_PHRASES_RATIO
    take_new, take_review = _split_counts(count, ratio, min(len(new_pool), count), len(review))
    # Review first, then new — mirrors GET /phrase-programs/{id}/study's own ordering.
    new_items = _serialize_phrase_batch(new_pool[:take_new], {}, new_pool)
    return review[:take_review] + new_items


def _grammar_phase(user: User, session: Session, count: int, include_new: bool = False) -> Optional[dict]:
    """Pick a random eligible lesson and sample `count` of its tasks.

    Eligible lessons are the ones the user has already passed; when `include_new` is
    set, also every lesson that is unlocked for this user and not yet passed. Locking
    comes from the grammar router's own rule (_annotate_lesson_progress) — a locked
    lesson is never eligible, even with include_new on.

    Returns None when no lesson is eligible, or when the chosen lesson generates no
    tasks — the caller then omits the grammar phase.
    """
    if count <= 0:
        return None

    passed_ids = set(session.exec(
        select(GrammarLessonResult.lesson_id)
        .where(
            GrammarLessonResult.user_id == user.id,
            GrammarLessonResult.passed == True,  # noqa: E712
        )
        .distinct()
    ).all())

    # Only lessons that still exist and are visible to this user are eligible —
    # get_lessons() already applies the published/level filtering.
    lessons = get_lessons(session)
    lesson_meta = {lesson["id"]: lesson for lesson in lessons}
    candidates = [lid for lid in lesson_meta if lid in passed_ids]
    if include_new:
        _annotate_lesson_progress(lessons, user, session)
        candidates += [
            lesson["id"] for lesson in lessons
            if lesson["id"] not in passed_ids and not lesson["is_locked"]
        ]
    if not candidates:
        return None

    lesson_id = random.choice(candidates)
    tasks = get_lesson_tasks(lesson_id, session) or []
    if not tasks:
        return None

    meta = lesson_meta[lesson_id]
    return {
        "lesson_id": lesson_id,
        "level": meta.get("level"),
        "rules": meta.get("rules") or [],
        "hint": meta.get("hint"),
        "tasks": random.sample(tasks, min(count, len(tasks))),
    }


@router.get("/me/continue-session")
def get_continue_session(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the content for one combined words → grammar → phrases session.

    Response:
      {
        "phases":  ["words", "grammar", "phrases"],   # only phases that have content
        "words":   [ ...word dicts, same shape as /review/known... ],
        "grammar": { "lesson_id", "level", "rules", "hint", "tasks" } | null,
        "phrases": [ ...phrase dicts, same shape as /phrases/review... ],
        "needs_enrollment": ["words", ...]            # empty unless the gate blocked
      }

    The enrollment gate runs first: with zero enrollment in any of words/grammar/
    phrases the session does not start at all — `needs_enrollment` names the missing
    categories, `phases` is empty, and nothing is charged against the daily quota.

    Otherwise a phase whose pool is empty is omitted from `phases` — never an error.
    When every phase is empty nothing is charged against the daily quota.
    Otherwise the daily quota is charged exactly once for the whole session
    (429 with the usual daily_limit_reached detail when the user is at the limit).
    """
    user = _require_user(authorization, session)

    # Hard gate — before any content is computed and before any quota charge.
    gaps = _enrollment_gaps(user, session)
    if gaps:
        return {"phases": [], "words": [], "grammar": None, "phrases": [], "needs_enrollment": gaps}

    include_new = user.continue_include_new

    words = _words_phase(user, session, _count(user.continue_words_count), include_new)
    grammar = _grammar_phase(user, session, _count(user.continue_grammar_count), include_new)
    phrases = _phrases_phase(user, session, _count(user.continue_phrases_count), include_new)

    phases: list[str] = []
    if words:
        phases.append("words")
    if grammar:
        phases.append("grammar")
    if phrases:
        phases.append("phrases")

    if not phases:
        # Nothing to study — don't burn a session on an empty flow.
        return {"phases": [], "words": [], "grammar": None, "phrases": [], "needs_enrollment": []}

    # Exactly one charge for the whole combined session.
    _quota_check_and_increment(user, session)

    return {
        "phases": phases,
        "words": words,
        "grammar": grammar,
        "phrases": phrases,
        "needs_enrollment": [],
    }
