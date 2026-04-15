# Admin-only endpoints for managing user tiers and premium access.
# All routes require is_admin=True on the authenticated user, otherwise 403.

from datetime import datetime, timezone, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select, func

from auth import require_user as _decode_user
from database import get_session
from models import User, DailyStudySession, WordList, SubcategoryMeta, Word, WordListItem, GrammarSentence, GrammarCaseRule, UserWordProgress, MistakeReport, GrammarLessonResult, PracticeExamResult, Article, AppSetting
from constants import DAILY_LIMIT
from quota import is_premium_active as _is_premium_active
from grammar_service import get_lessons as _get_grammar_lessons
import email_service

router = APIRouter()


def _require_admin(authorization: Optional[str], session: Session) -> User:
    user = _decode_user(authorization, session)
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


def _require_superadmin(authorization: Optional[str], session: Session) -> User:
    user = _decode_user(authorization, session)
    if not user.is_superadmin:
        raise HTTPException(status_code=403, detail="Forbidden")
    return user


@router.get("/users")
def list_users(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all users with their tier and today's session count."""
    _require_admin(authorization, session)

    today = datetime.now(timezone.utc).date()
    users = session.exec(select(User)).all()

    session_rows = session.exec(
        select(DailyStudySession).where(DailyStudySession.study_date == today)
    ).all()
    counts = {r.user_id: r.session_count for r in session_rows}

    return [
        {
            "id": u.id,
            "email": u.email,
            "name": u.name,
            "is_premium": u.is_premium,
            "premium_until": u.premium_until,
            "premium_active": _is_premium_active(u),
            "is_admin": u.is_admin,
            "is_superadmin": u.is_superadmin,
            "is_redactor": u.is_redactor,
            "sessions_today": counts.get(u.id, 0),
            "daily_limit": None if _is_premium_active(u) else DAILY_LIMIT,
            "last_login": u.last_login,
            "email_consent": u.email_consent,
        }
        for u in users
    ]


@router.get("/users/{user_id}/progress")
def get_user_progress(
    user_id: str,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return learning progress stats for a specific user. Admin-only."""
    _require_admin(authorization, session)
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    all_progress = session.exec(
        select(UserWordProgress).where(UserWordProgress.user_id == user_id)
    ).all()
    words_known = sum(1 for p in all_progress if p.status == "known")
    words_learning = sum(1 for p in all_progress if p.status == "learning")
    words_new = sum(1 for p in all_progress if p.status == "new")
    mistakes_total = sum(p.mistake_count for p in all_progress)

    # Streak: consecutive study days from UserWordProgress.last_seen
    studied_dates = {p.last_seen.date() for p in all_progress if p.last_seen}
    today = datetime.now(timezone.utc).date()
    streak = 0
    check = today if today in studied_dates else today - timedelta(days=1)
    while check in studied_dates:
        streak += 1
        check -= timedelta(days=1)

    # Sessions
    all_sessions = session.exec(
        select(DailyStudySession).where(DailyStudySession.user_id == user_id)
    ).all()
    sessions_total = sum(s.session_count for s in all_sessions)
    sessions_today = next(
        (s.session_count for s in all_sessions if s.study_date == today), 0
    )

    # Grammar: best score per lesson, count passed (>75%)
    grammar_results = session.exec(
        select(GrammarLessonResult).where(GrammarLessonResult.user_id == user_id)
    ).all()
    best_grammar: dict[int, float] = {}
    for r in grammar_results:
        pct = r.score / r.total if r.total > 0 else 0.0
        if r.lesson_id not in best_grammar or pct > best_grammar[r.lesson_id]:
            best_grammar[r.lesson_id] = pct
    grammar_lessons_passed = sum(1 for pct in best_grammar.values() if pct > 0.75)

    # Practice exams
    practice_results = session.exec(
        select(PracticeExamResult).where(PracticeExamResult.user_id == user_id)
    ).all()
    practice_exams_completed = len(practice_results)

    return {
        "words_known": words_known,
        "words_learning": words_learning,
        "words_new": words_new,
        "mistakes_total": mistakes_total,
        "sessions_today": sessions_today,
        "sessions_total": sessions_total,
        "streak": streak,
        "grammar_lessons_passed": grammar_lessons_passed,
        "grammar_lessons_total": len(_get_grammar_lessons(session)),
        "practice_exams_completed": practice_exams_completed,
        "last_active": target.last_login.isoformat() if target.last_login else None,
        "member_since": target.created_at.isoformat() if target.created_at else None,
    }


class SendEmailBody(BaseModel):
    subject: str
    body: str


@router.post("/users/{user_id}/send-email")
def send_email_to_user(
    user_id: str,
    payload: SendEmailBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Send an email to a specific user. Superadmin-only.

    Returns 403 if the user has not consented to receiving emails.
    """
    _require_superadmin(authorization, session)
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if not target.email_consent:
        raise HTTPException(status_code=403, detail="User has not consented to emails")
    try:
        email_service.send_email(target.email, payload.subject, payload.body)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return {"ok": True}


class AdminUpdate(BaseModel):
    is_admin: bool


@router.patch("/users/{user_id}/set-admin")
def set_admin(
    user_id: str,
    body: AdminUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Grant or revoke admin role. Superadmin-only."""
    _require_superadmin(authorization, session)
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.is_superadmin:
        raise HTTPException(status_code=400, detail="Cannot change superadmin role")
    target.is_admin = body.is_admin
    session.add(target)
    session.commit()
    return {"ok": True}


class RedactorUpdate(BaseModel):
    is_redactor: bool


@router.patch("/users/{user_id}/set-redactor")
def set_redactor(
    user_id: str,
    body: RedactorUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Grant or revoke redactor role. Admin-only."""
    _require_admin(authorization, session)
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    target.is_redactor = body.is_redactor
    session.add(target)
    session.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Permanently delete a user and all their progress data. Superadmin-only."""
    requester = _require_superadmin(authorization, session)
    if requester.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Delete all related data before removing the user
    for row in session.exec(select(GrammarLessonResult).where(GrammarLessonResult.user_id == user_id)).all():
        session.delete(row)
    for row in session.exec(select(UserWordProgress).where(UserWordProgress.user_id == user_id)).all():
        session.delete(row)
    for row in session.exec(select(DailyStudySession).where(DailyStudySession.user_id == user_id)).all():
        session.delete(row)
    for row in session.exec(select(MistakeReport).where(MistakeReport.user_id == user_id)).all():
        session.delete(row)

    session.delete(target)
    session.commit()
    return {"ok": True}


@router.get("/subcategories")
def list_subcategories(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all subcategories (derived from word lists) with their metadata."""
    _require_admin(authorization, session)
    # Collect all distinct subcategory keys from word lists
    lists = session.exec(select(WordList).where(WordList.archived == False)).all()  # noqa: E712
    all_keys = sorted({wl.subcategory for wl in lists if wl.subcategory})
    # Load existing metadata rows
    meta_rows = session.exec(select(SubcategoryMeta)).all()
    meta_map = {r.key: r for r in meta_rows}
    # Sort by sort_order (keys without a meta row sort last alphabetically)
    keys = sorted(
        all_keys,
        key=lambda k: (meta_map[k].sort_order or 0 if k in meta_map else 9999, k),
    )
    return [
        {
            "key": key,
            "cefr_level": meta_map[key].cefr_level if key in meta_map else None,
            "difficulty": meta_map[key].difficulty if key in meta_map else None,
            "article_url": meta_map[key].article_url if key in meta_map else None,
            "article_name_ru": meta_map[key].article_name_ru if key in meta_map else None,
            "article_name_en": meta_map[key].article_name_en if key in meta_map else None,
            "sort_order": meta_map[key].sort_order or 0 if key in meta_map else 0,
            "name_ru": meta_map[key].name_ru if key in meta_map else None,
            "name_en": meta_map[key].name_en if key in meta_map else None,
            "status": meta_map[key].status if key in meta_map else "draft",
            "created_by": meta_map[key].created_by if key in meta_map else None,
        }
        for key in keys
    ]


class SubcategoryMetaUpdate(BaseModel):
    cefr_level: Optional[str] = None
    difficulty: Optional[str] = None
    article_url: Optional[str] = None
    article_name_ru: Optional[str] = None
    article_name_en: Optional[str] = None
    name_ru: Optional[str] = None
    name_en: Optional[str] = None


@router.patch("/subcategories/{key}")
def update_subcategory_meta(
    key: str,
    body: SubcategoryMetaUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Upsert CEFR level, difficulty, and article URL for a subcategory."""
    _require_admin(authorization, session)
    row = session.exec(select(SubcategoryMeta).where(SubcategoryMeta.key == key)).first()
    if row is None:
        row = SubcategoryMeta(key=key)
        session.add(row)
    row.cefr_level = body.cefr_level
    row.difficulty = body.difficulty
    row.article_url = body.article_url
    row.article_name_ru = body.article_name_ru
    row.article_name_en = body.article_name_en
    row.name_ru = body.name_ru.strip() if body.name_ru and body.name_ru.strip() else None
    row.name_en = body.name_en.strip() if body.name_en and body.name_en.strip() else None
    session.commit()
    return {"ok": True}


class StatusUpdate(BaseModel):
    status: str  # draft | testing | published


@router.patch("/subcategories/{key}/status")
def set_subcategory_status(
    key: str,
    body: StatusUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Set visibility status for a vocabulary subcategory group."""
    _require_admin(authorization, session)
    if body.status not in ("draft", "testing", "published"):
        raise HTTPException(status_code=400, detail="status must be draft, testing, or published")
    row = session.exec(select(SubcategoryMeta).where(SubcategoryMeta.key == key)).first()
    if row is None:
        row = SubcategoryMeta(key=key)
        session.add(row)
    row.status = body.status
    session.commit()
    return {"ok": True}


class PremiumUpdate(BaseModel):
    is_premium: bool
    premium_until: Optional[datetime] = None  # None = no expiry


@router.patch("/users/{user_id}/premium")
def set_premium(
    user_id: str,
    body: PremiumUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Grant or revoke premium for a user. premium_until=None means unlimited."""
    _require_admin(authorization, session)

    target = session.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.is_premium and body.premium_until is not None:
        now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
        if body.premium_until <= now_naive:
            raise HTTPException(status_code=400, detail="premium_until must be in the future")

    target.is_premium = body.is_premium
    target.premium_until = body.premium_until
    session.add(target)
    session.commit()
    return {"ok": True}


# ── Content management ──────────────────────────────────────────────────────


@router.get("/content/word-lists")
def get_content_word_lists(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all non-archived word lists ordered by subcategory sort_order then list sort_order."""
    _require_admin(authorization, session)
    lists = session.exec(
        select(WordList).where(WordList.archived == False)  # noqa: E712
    ).all()
    meta_rows = session.exec(select(SubcategoryMeta)).all()
    meta_map = {r.key: r for r in meta_rows}

    # Count words per list in one query
    counts = dict(
        session.exec(
            select(WordListItem.word_list_id, func.count(WordListItem.id))
            .group_by(WordListItem.word_list_id)
        ).all()
    )

    def _subcat_order(key: Optional[str]) -> int:
        if key and key in meta_map and meta_map[key].sort_order is not None:
            return meta_map[key].sort_order
        return 9999

    sorted_lists = sorted(
        lists,
        key=lambda wl: (_subcat_order(wl.subcategory), wl.sort_order or 0, wl.id or 0),
    )
    return [
        {
            "id": wl.id,
            "title": wl.title,
            "title_en": wl.title_en,
            "description": wl.description,
            "description_en": wl.description_en,
            "subcategory": wl.subcategory,
            "sort_order": wl.sort_order or 0,
            "word_count": counts.get(wl.id, 0),
        }
        for wl in sorted_lists
    ]


class WordListMetaUpdate(BaseModel):
    title_ru: Optional[str] = None
    title_en: Optional[str] = None


@router.patch("/content/word-lists/{list_id}/meta")
def update_word_list_meta(
    list_id: int,
    body: WordListMetaUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update the Russian and English title for a word list."""
    _require_admin(authorization, session)
    wl = session.get(WordList, list_id)
    if not wl:
        raise HTTPException(status_code=404, detail="List not found")
    if body.title_ru is not None:
        stripped = body.title_ru.strip()
        if stripped:
            wl.title = stripped
    wl.title_en = body.title_en.strip() if body.title_en and body.title_en.strip() else None
    session.add(wl)
    session.commit()
    return {"ok": True}


class SubcategoryReorderItem(BaseModel):
    key: str
    sort_order: int


@router.patch("/content/subcategories/reorder")
def reorder_subcategories(
    body: List[SubcategoryReorderItem],
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update sort_order for multiple subcategories at once. Upserts SubcategoryMeta rows."""
    _require_admin(authorization, session)
    for item in body:
        row = session.exec(select(SubcategoryMeta).where(SubcategoryMeta.key == item.key)).first()
        if row is None:
            row = SubcategoryMeta(key=item.key)
            session.add(row)
        row.sort_order = item.sort_order
    session.commit()
    return {"ok": True}


class WordListReorderItem(BaseModel):
    id: int
    sort_order: int


@router.patch("/content/word-lists/reorder")
def reorder_word_lists(
    body: List[WordListReorderItem],
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update sort_order for multiple word lists at once."""
    _require_admin(authorization, session)
    for item in body:
        wl = session.get(WordList, item.id)
        if wl:
            wl.sort_order = item.sort_order
            session.add(wl)
    session.commit()
    return {"ok": True}


@router.get("/content/word-lists/{list_id}/words")
def get_list_words_admin(
    list_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all words in a list ordered by position, for admin editing."""
    _require_admin(authorization, session)
    wl = session.get(WordList, list_id)
    if not wl:
        raise HTTPException(status_code=404, detail="List not found")
    rows = session.exec(
        select(Word, WordListItem)
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
            "position": wli.position,
            "item_id": wli.id,
        }
        for w, wli in rows
    ]


class WordUpdate(BaseModel):
    lithuanian: str
    translation_en: str
    translation_ru: str
    hint: Optional[str] = None
    star: Optional[int] = None  # 1=base form, 2=inflected/multi-form, 3=phrase


@router.patch("/content/words/{word_id}")
def update_word(
    word_id: int,
    body: WordUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Edit a word's content. Validates required fields server-side."""
    _require_admin(authorization, session)
    if not body.lithuanian.strip():
        raise HTTPException(status_code=400, detail="lithuanian is required")
    if not body.translation_ru.strip():
        raise HTTPException(status_code=400, detail="translation_ru is required")
    if body.star is not None and body.star not in (1, 2, 3):
        raise HTTPException(status_code=400, detail="star must be 1, 2 or 3")
    word = session.get(Word, word_id)
    if not word or word.archived:
        raise HTTPException(status_code=404, detail="Word not found")
    word.lithuanian = body.lithuanian.strip()
    word.translation_en = body.translation_en.strip()
    word.translation_ru = body.translation_ru.strip()
    word.hint = body.hint.strip() if body.hint and body.hint.strip() else None
    if body.star is not None:
        word.star = body.star
    session.add(word)
    session.commit()
    return {"ok": True}


class WordPositionItem(BaseModel):
    item_id: int   # WordListItem.id
    position: int


@router.patch("/content/word-lists/{list_id}/words/reorder")
def reorder_words(
    list_id: int,
    body: List[WordPositionItem],
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update position for words in a list. item_id refers to WordListItem.id."""
    _require_admin(authorization, session)
    for item in body:
        wli = session.get(WordListItem, item.item_id)
        if wli and wli.word_list_id == list_id:
            wli.position = item.position
            session.add(wli)
    session.commit()
    return {"ok": True}


# ── Grammar content management ───────────────────────────────────────────────


@router.get("/grammar/sentences")
def list_grammar_sentences(
    case_index: Optional[int] = None,
    show_archived: bool = False,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return grammar sentences, optionally filtered by case_index.

    By default archived sentences are excluded. Pass show_archived=true to include them.
    """
    _require_admin(authorization, session)
    stmt = select(GrammarSentence)
    if case_index is not None:
        stmt = stmt.where(GrammarSentence.case_index == case_index)
    if not show_archived:
        stmt = stmt.where(GrammarSentence.archived == False)  # noqa: E712
    stmt = stmt.order_by(GrammarSentence.case_index, GrammarSentence.id)
    rows = session.exec(stmt).all()
    return [
        {
            "id": s.id,
            "case_index": s.case_index,
            "display": s.display,
            "answer_ending": s.answer_ending,
            "full_word": s.full_word,
            "russian": s.russian,
            "archived": s.archived,
            "use_in_basic": s.use_in_basic,
            "use_in_advanced": s.use_in_advanced,
            "use_in_practice": s.use_in_practice,
        }
        for s in rows
    ]


class GrammarSentenceCreate(BaseModel):
    case_index: int
    display: str
    answer_ending: str
    full_word: str
    russian: str
    use_in_basic: bool = True
    use_in_advanced: bool = True
    use_in_practice: bool = True


@router.post("/grammar/sentences")
def create_grammar_sentence(
    body: GrammarSentenceCreate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Create a new grammar sentence."""
    _require_admin(authorization, session)
    if not (1 <= body.case_index <= 14):
        raise HTTPException(status_code=400, detail="case_index must be between 1 and 14")
    if "___" not in body.display:
        raise HTTPException(status_code=400, detail="display must contain ___ blank placeholder")
    if not body.answer_ending.strip():
        raise HTTPException(status_code=400, detail="answer_ending is required")
    if not body.full_word.strip():
        raise HTTPException(status_code=400, detail="full_word is required")
    if not body.russian.strip():
        raise HTTPException(status_code=400, detail="russian is required")
    sentence = GrammarSentence(
        case_index=body.case_index,
        display=body.display.strip(),
        answer_ending=body.answer_ending.strip(),
        full_word=body.full_word.strip(),
        russian=body.russian.strip(),
        use_in_basic=body.use_in_basic,
        use_in_advanced=body.use_in_advanced,
        use_in_practice=body.use_in_practice,
    )
    session.add(sentence)
    session.commit()
    session.refresh(sentence)
    return {"ok": True, "id": sentence.id}


class GrammarSentenceUpdate(BaseModel):
    display: str
    answer_ending: str
    full_word: str
    russian: str
    use_in_basic: bool = True
    use_in_advanced: bool = True
    use_in_practice: bool = True


@router.patch("/grammar/sentences/{sentence_id}")
def update_grammar_sentence(
    sentence_id: int,
    body: GrammarSentenceUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Edit a grammar sentence."""
    _require_admin(authorization, session)
    if "___" not in body.display:
        raise HTTPException(status_code=400, detail="display must contain ___ blank placeholder")
    if not body.answer_ending.strip():
        raise HTTPException(status_code=400, detail="answer_ending is required")
    if not body.full_word.strip():
        raise HTTPException(status_code=400, detail="full_word is required")
    if not body.russian.strip():
        raise HTTPException(status_code=400, detail="russian is required")
    sentence = session.get(GrammarSentence, sentence_id)
    if not sentence:
        raise HTTPException(status_code=404, detail="Sentence not found")
    sentence.display = body.display.strip()
    sentence.answer_ending = body.answer_ending.strip()
    sentence.full_word = body.full_word.strip()
    sentence.russian = body.russian.strip()
    sentence.use_in_basic = body.use_in_basic
    sentence.use_in_advanced = body.use_in_advanced
    sentence.use_in_practice = body.use_in_practice
    session.add(sentence)
    session.commit()
    return {"ok": True}


@router.delete("/grammar/sentences/{sentence_id}")
def archive_grammar_sentence(
    sentence_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Soft-delete a grammar sentence (sets archived=True)."""
    _require_admin(authorization, session)
    sentence = session.get(GrammarSentence, sentence_id)
    if not sentence:
        raise HTTPException(status_code=404, detail="Sentence not found")
    sentence.archived = True
    session.add(sentence)
    session.commit()
    return {"ok": True}


@router.get("/grammar/rules")
def list_grammar_rules(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return all grammar case rules ordered by case_index."""
    _require_admin(authorization, session)
    rules = session.exec(
        select(GrammarCaseRule).order_by(GrammarCaseRule.case_index)
    ).all()
    return [
        {
            "id": r.id,
            "case_index": r.case_index,
            "name_ru": r.name_ru,
            "question": r.question,
            "usage": r.usage,
            "endings_sg": r.endings_sg,
            "endings_pl": r.endings_pl,
            "transform": r.transform,
            "status": r.status,
            "article_slug": r.article_slug,
        }
        for r in rules
    ]


@router.patch("/grammar/rules/{rule_id}/status")
def set_grammar_rule_status(
    rule_id: int,
    body: StatusUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Set visibility status for a grammar case group."""
    _require_admin(authorization, session)
    if body.status not in ("draft", "testing", "published"):
        raise HTTPException(status_code=400, detail="status must be draft, testing, or published")
    rule = session.get(GrammarCaseRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    rule.status = body.status
    session.add(rule)
    session.commit()
    return {"ok": True}


import json as _json

# ---------------------------------------------------------------------------
# CEFR threshold settings
# ---------------------------------------------------------------------------

VALID_CEFR_LEVELS = {"0", "A1", "A2", "B1", "B2", "C1", "C2"}


@router.get("/settings/cefr-thresholds")
def get_cefr_thresholds(session: Session = Depends(get_session)):
    """Return current CEFR level word-count thresholds. Public — no auth required."""
    row = session.exec(select(AppSetting).where(AppSetting.key == "cefr_thresholds")).first()
    if not row:
        raise HTTPException(status_code=404, detail="CEFR thresholds not seeded")
    return _json.loads(row.value)


class CefrThresholdEntry(BaseModel):
    level: str
    threshold: int


@router.patch("/settings/cefr-thresholds")
def update_cefr_thresholds(
    body: List[CefrThresholdEntry],
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Update CEFR level thresholds. Admin-only."""
    _require_admin(authorization, session)
    levels = {e.level for e in body}
    if levels != VALID_CEFR_LEVELS:
        raise HTTPException(status_code=400, detail="Must provide all 7 levels: 0 A1 A2 B1 B2 C1 C2")
    for e in body:
        if e.threshold <= 0:
            raise HTTPException(status_code=400, detail=f"Threshold for {e.level} must be > 0")
    row = session.exec(select(AppSetting).where(AppSetting.key == "cefr_thresholds")).first()
    if not row:
        row = AppSetting(key="cefr_thresholds", value="")
        session.add(row)
    row.value = _json.dumps([{"level": e.level, "threshold": e.threshold} for e in body])
    session.commit()
    return {"ok": True}


class GrammarRuleUpdate(BaseModel):
    name_ru: str
    question: str
    usage: str
    endings_sg: str
    endings_pl: str
    transform: str
    article_slug: Optional[str] = None


@router.patch("/grammar/rules/{rule_id}")
def update_grammar_rule(
    rule_id: int,
    body: GrammarRuleUpdate,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Edit a grammar case rule."""
    _require_admin(authorization, session)
    if not body.name_ru.strip():
        raise HTTPException(status_code=400, detail="name_ru is required")
    rule = session.get(GrammarCaseRule, rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="Rule not found")
    slug = body.article_slug.strip() if body.article_slug else None
    if slug:
        article = session.exec(select(Article).where(Article.slug == slug)).first()
        if not article:
            raise HTTPException(status_code=400, detail=f"Article '{slug}' not found")
    rule.name_ru = body.name_ru.strip()
    rule.question = body.question.strip()
    rule.usage = body.usage.strip()
    rule.endings_sg = body.endings_sg.strip()
    rule.endings_pl = body.endings_pl.strip()
    rule.transform = body.transform.strip()
    rule.article_slug = slug
    session.add(rule)
    session.commit()
    return {"ok": True}
