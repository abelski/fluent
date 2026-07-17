# New-account onboarding: default program enrollment.
#
# Called from both user-creation points in auth.py so a fresh account lands on
# a dashboard with a basic word program and a starter phrase program instead of
# an empty page. Applies strictly at account creation — users who deliberately
# unenroll are never re-enrolled.

import logging

from sqlmodel import Session, select

import constants
from models import (
    PhraseProgram,
    SubcategoryMeta,
    User,
    UserPhraseProgramEnrollment,
    UserProgram,
)

logger = logging.getLogger(__name__)


def enroll_default_programs(user: User, session: Session) -> None:
    """Enroll a newly created user into the default word and phrase programs.

    Must never break login: any failure is logged and swallowed.
    """
    try:
        for key in constants.DEFAULT_WORD_PROGRAM_KEYS:
            meta = session.exec(
                select(SubcategoryMeta).where(
                    SubcategoryMeta.key == key,
                    SubcategoryMeta.status == "published",
                )
            ).first()
            if not meta:
                continue
            existing = session.exec(
                select(UserProgram).where(
                    UserProgram.user_id == user.id,
                    UserProgram.subcategory_key == key,
                )
            ).first()
            if not existing:
                session.add(UserProgram(user_id=user.id, subcategory_key=key))

        # Starter phrase program: easiest public one (stable heuristic, no
        # hardcoded ids — currently resolves to "Sékmės! A1.1 — Фразы").
        program = session.exec(
            select(PhraseProgram)
            .where(PhraseProgram.is_public == True)  # noqa: E712
            .order_by(PhraseProgram.difficulty, PhraseProgram.id)
        ).first()
        if program:
            existing = session.exec(
                select(UserPhraseProgramEnrollment).where(
                    UserPhraseProgramEnrollment.user_id == user.id,
                    UserPhraseProgramEnrollment.program_id == program.id,
                )
            ).first()
            if not existing:
                session.add(UserPhraseProgramEnrollment(user_id=user.id, program_id=program.id))

        session.commit()
    except Exception:
        logger.exception("Default program enrollment failed for user %s", user.id)
        session.rollback()
