# Custom community programs — created by redactors, enrollable by any logged-in user.
# Each program contains one or more user-created word sets (flashcard lists).

from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select, func, col

from database import get_session
from models import (
    CustomProgram,
    CustomProgramList,
    UserCustomProgramEnrollment,
    User,
    WordList,
    WordListItem,
    Word,
    UserWordProgress,
)
from auth import require_user as _require_user, try_get_user as _try_get_user

router = APIRouter()


def _can_author(user: User) -> bool:
    """True if the user is allowed to create/edit community programs."""
    return user.is_redactor or user.is_admin or user.is_superadmin


def _require_author(user: User) -> None:
    if not _can_author(user):
        raise HTTPException(status_code=403, detail="Redactor role required")


def _program_details_batch(
    programs: list[CustomProgram], session: Session, known_author: Optional[User] = None
) -> dict[int, dict]:
    """Serialise many CustomPrograms — list IDs, word counts, enrollment counts,
    and author names — in a constant number of queries regardless of how many
    programs or word lists are involved.

    `known_author` skips the author lookup query entirely when every program in
    the batch was created by the same, already-loaded user (e.g. "my programs")."""
    if not programs:
        return {}
    program_ids = [p.id for p in programs]

    # 1. All CustomProgramList rows for these programs in one query, ordered so
    #    each program's list_ids preserve position (same order as before).
    cp_rows = session.exec(
        select(CustomProgramList)
        .where(col(CustomProgramList.custom_program_id).in_(program_ids))
        .order_by(CustomProgramList.custom_program_id, CustomProgramList.position)
    ).all()
    list_ids_by_program: dict[int, list[int]] = {pid: [] for pid in program_ids}
    all_list_ids: list[int] = []
    for row in cp_rows:
        list_ids_by_program[row.custom_program_id].append(row.word_list_id)
        all_list_ids.append(row.word_list_id)

    # 2. Word counts per list, grouped in one query; summed per program in Python.
    word_count_by_list: dict[int, int] = {}
    if all_list_ids:
        word_count_by_list = dict(
            session.exec(
                select(WordListItem.word_list_id, func.count(WordListItem.id))
                .where(col(WordListItem.word_list_id).in_(all_list_ids))
                .group_by(WordListItem.word_list_id)
            ).all()
        )

    # 3. Enrollment counts per program in one grouped query.
    enroll_count_by_program: dict[int, int] = dict(
        session.exec(
            select(UserCustomProgramEnrollment.custom_program_id, func.count(UserCustomProgramEnrollment.id))
            .where(col(UserCustomProgramEnrollment.custom_program_id).in_(program_ids))
            .group_by(UserCustomProgramEnrollment.custom_program_id)
        ).all()
    )

    # 4. Authors — one query for every distinct created_by, unless the caller
    #    already knows every program shares the same author.
    if known_author is not None:
        authors_by_id: dict[str, User] = {known_author.id: known_author}
    else:
        author_ids = {p.created_by for p in programs if p.created_by}
        authors_by_id = {}
        if author_ids:
            authors = session.exec(select(User).where(col(User.id).in_(author_ids))).all()
            authors_by_id = {u.id: u for u in authors}

    result: dict[int, dict] = {}
    for program in programs:
        list_ids = list_ids_by_program.get(program.id, [])
        word_count = sum(word_count_by_list.get(lid, 0) for lid in list_ids)
        author = authors_by_id.get(program.created_by)
        result[program.id] = {
            "id": program.id,
            "title": program.title,
            "title_en": program.title_en,
            "description": program.description,
            "description_en": program.description_en,
            "lang_ru": program.lang_ru,
            "lang_en": program.lang_en,
            "created_by": program.created_by,
            "author_name": author.name if author else None,
            "share_token": program.share_token,
            "is_published": program.is_published,
            "created_at": program.created_at.isoformat(),
            "list_ids": list_ids,
            "word_count": word_count,
            "enrollment_count": enroll_count_by_program.get(program.id, 0),
        }
    return result


def _program_detail(program: CustomProgram, session: Session, author: Optional[User] = None) -> dict:
    """Serialise a single CustomProgram. Delegates to the batch helper with a
    one-element list so there is one code path for both call shapes."""
    return _program_details_batch([program], session, known_author=author)[program.id]


def _word_sets_for_program(program_id: int, session: Session) -> list[dict]:
    """Return word sets + word pairs for a program in a constant number of
    queries regardless of set/word count. Read path only — shared by the
    community and creator-owned word-sets endpoints. Do NOT reuse this for
    `_delete_owned_word_sets`, which needs the ownership filter and phased
    flush order that ties it to the delete path specifically."""
    links = session.exec(
        select(CustomProgramList)
        .where(CustomProgramList.custom_program_id == program_id)
        .order_by(CustomProgramList.position)
    ).all()
    list_ids = [link.word_list_id for link in links]
    if not list_ids:
        return []

    lists_by_id = {
        wl.id: wl for wl in session.exec(select(WordList).where(col(WordList.id).in_(list_ids))).all()
    }

    items = session.exec(
        select(WordListItem)
        .where(col(WordListItem.word_list_id).in_(list_ids))
        .order_by(WordListItem.word_list_id, WordListItem.position)
    ).all()
    items_by_list: dict[int, list[WordListItem]] = {}
    all_word_ids: list[int] = []
    for item in items:
        items_by_list.setdefault(item.word_list_id, []).append(item)
        all_word_ids.append(item.word_id)

    words_by_id: dict[int, Word] = {}
    if all_word_ids:
        words_by_id = {w.id: w for w in session.exec(select(Word).where(col(Word.id).in_(all_word_ids))).all()}

    result = []
    for link in links:
        wl = lists_by_id.get(link.word_list_id)
        if not wl:
            continue
        words = []
        for item in items_by_list.get(wl.id, []):
            word = words_by_id.get(item.word_id)
            if word:
                words.append({"front": word.lithuanian, "back_ru": word.translation_ru, "back_en": word.translation_en})
        result.append({"id": wl.id, "title": wl.title, "words": words})
    return result


# ── Word set helpers ──────────────────────────────────────────────────────────

class WordPairInput(BaseModel):
    front: str
    back_ru: str = ''
    back_en: str = ''


class WordSetInput(BaseModel):
    title: str
    words: list[WordPairInput] = []


def _delete_owned_word_sets(program: CustomProgram, user_id: str, session: Session) -> None:
    """Delete all word lists (and their words) that were created by this user for this program."""
    links = session.exec(
        select(CustomProgramList).where(CustomProgramList.custom_program_id == program.id)
    ).all()
    word_lists_to_delete: list[WordList] = []
    words_to_delete: list[Word] = []

    for link in links:
        wl = session.get(WordList, link.word_list_id)
        if wl and wl.created_by == user_id:
            items = session.exec(select(WordListItem).where(WordListItem.word_list_id == wl.id)).all()
            for item in items:
                word = session.get(Word, item.word_id)
                session.delete(item)
                if word:
                    words_to_delete.append(word)
            word_lists_to_delete.append(wl)
        session.delete(link)

    # Step 1: flush WordListItem + CustomProgramList deletions first
    # (removes FK references to both WordList and Word)
    session.flush()

    # Step 2: delete WordList rows (no more FK references from word_list_item)
    for wl in word_lists_to_delete:
        session.delete(wl)
    session.flush()

    # Step 3: delete UserWordProgress records for these words (FK word_progress → word)
    if words_to_delete:
        word_ids = [w.id for w in words_to_delete if w.id is not None]
        for progress_row in session.exec(
            select(UserWordProgress).where(col(UserWordProgress.word_id).in_(word_ids))
        ).all():
            session.delete(progress_row)
        session.flush()

    # Step 4: delete Word rows
    for word in words_to_delete:
        session.delete(word)
    session.flush()


def _create_word_sets(program: CustomProgram, word_sets: list[WordSetInput], user_id: str, session: Session) -> None:
    """Create WordList + Word + WordListItem rows for each word set and link them to the program."""
    for pos, ws in enumerate(word_sets):
        wl_title = ws.title.strip() or f"Набор {pos + 1}"
        wl = WordList(title=wl_title, is_public=False, created_by=user_id)
        session.add(wl)
        session.flush()  # get wl.id

        word_pos = 0
        for wp in ws.words:
            if not wp.front.strip() and not wp.back_ru.strip() and not wp.back_en.strip():
                continue
            word = Word(
                lithuanian=wp.front.strip(),
                translation_ru=wp.back_ru.strip(),
                translation_en=wp.back_en.strip() or wp.back_ru.strip(),  # fallback to ru if en absent
            )
            session.add(word)
            session.flush()
            session.add(WordListItem(word_list_id=wl.id, word_id=word.id, position=word_pos))
            word_pos += 1

        session.add(CustomProgramList(custom_program_id=program.id, word_list_id=wl.id, position=pos))


# ── Public endpoints ──────────────────────────────────────────────────────────

@router.get("/programs/community")
def list_community_programs(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """List all published community programs. Auth optional."""
    _try_get_user(authorization, session)
    programs = session.exec(
        select(CustomProgram).where(CustomProgram.is_published == True)  # noqa: E712
        .order_by(CustomProgram.created_at.desc())
    ).all()
    details = _program_details_batch(programs, session)
    return [details[p.id] for p in programs]


@router.get("/programs/community/{share_token}")
def get_community_program(
    share_token: str,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Get one community program by share token. Requires auth."""
    _require_user(authorization, session)
    program = session.exec(
        select(CustomProgram).where(CustomProgram.share_token == share_token)
    ).first()
    if not program or not program.is_published:
        raise HTTPException(status_code=404, detail="Program not found")
    return _program_detail(program, session)


@router.get("/programs/community/{share_token}/word-sets")
def get_community_program_word_sets(
    share_token: str,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return word sets + word pairs for a published program. Any authenticated user can view."""
    _require_user(authorization, session)
    program = session.exec(
        select(CustomProgram).where(CustomProgram.share_token == share_token)
    ).first()
    if not program or not program.is_published:
        raise HTTPException(status_code=404, detail="Program not found")

    return _word_sets_for_program(program.id, session)


# ── Redactor — own programs ───────────────────────────────────────────────────

class CreateProgramBody(BaseModel):
    title: str
    title_en: Optional[str] = None
    description: Optional[str] = None
    description_en: Optional[str] = None
    lang_ru: bool = True
    lang_en: bool = False
    word_sets: list[WordSetInput] = []


class UpdateProgramBody(BaseModel):
    title: Optional[str] = None
    title_en: Optional[str] = None
    description: Optional[str] = None
    description_en: Optional[str] = None
    lang_ru: Optional[bool] = None
    lang_en: Optional[bool] = None
    word_sets: Optional[list[WordSetInput]] = None


@router.get("/me/custom-programs")
def list_my_programs(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """List programs created by the current user."""
    user = _require_user(authorization, session)
    programs = session.exec(
        select(CustomProgram)
        .where(CustomProgram.created_by == user.id)
        .order_by(CustomProgram.created_at.desc())
    ).all()
    details = _program_details_batch(programs, session, known_author=user)
    return [details[p.id] for p in programs]


@router.get("/me/custom-programs/{program_id}/word-sets")
def get_program_word_sets(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Return the full word content (word sets + word pairs) for a program. Creator only."""
    user = _require_user(authorization, session)
    program = session.get(CustomProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if program.created_by != user.id and not (user.is_admin or user.is_superadmin):
        raise HTTPException(status_code=403, detail="Not your program")

    return _word_sets_for_program(program.id, session)


@router.post("/me/custom-programs", status_code=201)
def create_program(
    body: CreateProgramBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Create a new community program with inline word sets. Redactor/admin only."""
    user = _require_user(authorization, session)
    _require_author(user)
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    if not body.word_sets:
        raise HTTPException(status_code=422, detail="At least one word set is required")

    program = CustomProgram(
        title=body.title.strip(),
        title_en=body.title_en,
        description=body.description,
        description_en=body.description_en,
        lang_ru=body.lang_ru,
        lang_en=body.lang_en,
        created_by=user.id,
    )
    session.add(program)
    session.flush()
    _create_word_sets(program, body.word_sets, user.id, session)
    # Auto-enroll the creator so their program appears in their word lists
    session.add(UserCustomProgramEnrollment(user_id=user.id, custom_program_id=program.id))
    session.commit()
    session.refresh(program)
    return _program_detail(program, session, author=user)


@router.put("/me/custom-programs/{program_id}")
def update_program(
    program_id: int,
    body: UpdateProgramBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Edit own program title, description, or word sets."""
    user = _require_user(authorization, session)
    _require_author(user)
    program = session.get(CustomProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if program.created_by != user.id and not (user.is_admin or user.is_superadmin):
        raise HTTPException(status_code=403, detail="Not your program")
    if body.title is not None:
        if not body.title.strip():
            raise HTTPException(status_code=422, detail="Title is required")
        program.title = body.title.strip()
    if body.title_en is not None:
        program.title_en = body.title_en or None
    if body.description is not None:
        program.description = body.description or None
    if body.description_en is not None:
        program.description_en = body.description_en or None
    if body.lang_ru is not None:
        program.lang_ru = body.lang_ru
    if body.lang_en is not None:
        program.lang_en = body.lang_en
    if body.word_sets is not None:
        _delete_owned_word_sets(program, user.id, session)
        _create_word_sets(program, body.word_sets, user.id, session)
    session.add(program)
    session.commit()
    return _program_detail(program, session, author=user)


@router.delete("/me/custom-programs/{program_id}", status_code=204)
def delete_program(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Delete own program, its word sets, and all enrollments."""
    user = _require_user(authorization, session)
    program = session.get(CustomProgram, program_id)
    if not program:
        raise HTTPException(status_code=404, detail="Program not found")
    if program.created_by != user.id and not (user.is_admin or user.is_superadmin):
        raise HTTPException(status_code=403, detail="Not your program")
    # delete word lists using the creator's ID so they are properly cleaned up
    _delete_owned_word_sets(program, program.created_by, session)
    # delete enrollments
    for row in session.exec(select(UserCustomProgramEnrollment).where(UserCustomProgramEnrollment.custom_program_id == program_id)).all():
        session.delete(row)
    session.delete(program)
    session.commit()


# ── Enrollment ────────────────────────────────────────────────────────────────

class EnrollBody(BaseModel):
    share_token: str


@router.get("/me/custom-program-enrollments")
def list_enrollments(
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """List custom programs the current user is enrolled in, with their list IDs."""
    user = _require_user(authorization, session)
    enrollments = session.exec(
        select(UserCustomProgramEnrollment)
        .where(UserCustomProgramEnrollment.user_id == user.id)
    ).all()
    result = []
    for enr in enrollments:
        program = session.get(CustomProgram, enr.custom_program_id)
        if not program or not program.is_published:
            continue
        rows = session.exec(
            select(CustomProgramList)
            .where(CustomProgramList.custom_program_id == program.id)
            .order_by(CustomProgramList.position)
        ).all()
        result.append({
            "id": program.id,
            "title": program.title,
            "share_token": program.share_token,
            "list_ids": [r.word_list_id for r in rows],
        })
    return result


@router.post("/me/custom-program-enrollments", status_code=201)
def enroll(
    body: EnrollBody,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Enroll the current user in a community program by share token."""
    user = _require_user(authorization, session)
    program = session.exec(
        select(CustomProgram).where(CustomProgram.share_token == body.share_token)
    ).first()
    if not program or not program.is_published:
        raise HTTPException(status_code=404, detail="Program not found")
    existing = session.exec(
        select(UserCustomProgramEnrollment)
        .where(
            UserCustomProgramEnrollment.user_id == user.id,
            UserCustomProgramEnrollment.custom_program_id == program.id,
        )
    ).first()
    if existing:
        return {"ok": True, "already_enrolled": True}
    session.add(UserCustomProgramEnrollment(user_id=user.id, custom_program_id=program.id))
    session.commit()
    return {"ok": True, "already_enrolled": False}


@router.delete("/me/custom-program-enrollments/{program_id}", status_code=204)
def unenroll(
    program_id: int,
    authorization: Optional[str] = Header(None),
    session: Session = Depends(get_session),
):
    """Remove a custom program enrollment."""
    user = _require_user(authorization, session)
    row = session.exec(
        select(UserCustomProgramEnrollment)
        .where(
            UserCustomProgramEnrollment.user_id == user.id,
            UserCustomProgramEnrollment.custom_program_id == program_id,
        )
    ).first()
    if row:
        session.delete(row)
        session.commit()
