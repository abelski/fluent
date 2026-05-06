"""Daily background job: generate re-engagement email drafts for inactive users.

Runs once per day at 09:00 UTC via APScheduler.
Creates PreparedMessage records (status='draft') for users who haven't logged in
for 30+ days and have no existing draft already pending.
"""

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select

from database import engine
from email_templates import generate_reengagement_email
from models import AppSetting, PreparedMessage, User

logger = logging.getLogger(__name__)

INACTIVITY_DAYS = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _load_template(session: Session, lang: str) -> tuple[str, str] | None:
    """Return (subject, body) from DB-stored custom template, or None if not set."""
    import json as _json
    key = f"email_template_{lang}"
    row = session.exec(select(AppSetting).where(AppSetting.key == key)).first()
    if row:
        data = _json.loads(row.value)
        return data.get("subject", ""), data.get("body", "")
    return None


def generate_inactive_messages() -> None:
    """Find users inactive for 30+ days and create draft messages for them."""
    cutoff = _utcnow() - timedelta(days=INACTIVITY_DAYS)
    with Session(engine) as session:
        users = session.exec(select(User)).all()
        created = 0
        for user in users:
            if not user.email_consent:
                continue

            last_activity = user.last_login or user.created_at
            if last_activity is None or last_activity >= cutoff:
                continue

            # Skip if a draft already exists for this user
            existing = session.exec(
                select(PreparedMessage).where(
                    PreparedMessage.user_id == user.id,
                    PreparedMessage.status == "draft",
                )
            ).first()
            if existing:
                continue

            days_inactive = (_utcnow() - last_activity).days
            custom = _load_template(session, user.lang)
            if custom:
                subject = custom[0].replace("{{name}}", user.name).replace("{{days}}", str(days_inactive))
                body = custom[1].replace("{{name}}", user.name).replace("{{days}}", str(days_inactive))
            else:
                subject, body = generate_reengagement_email(user.name, days_inactive, user.lang)
            msg = PreparedMessage(
                user_id=user.id,
                user_email=user.email,
                user_name=user.name,
                user_lang=user.lang,
                subject=subject,
                body=body,
                status="draft",
                inactive_since=last_activity,
            )
            session.add(msg)
            created += 1

        session.commit()
        logger.info("Scheduler: generated %d new prepared messages", created)


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(generate_inactive_messages, "cron", hour=9, minute=0)
    scheduler.start()
    logger.info("Scheduler started — inactive-user job runs daily at 09:00 UTC")
    return scheduler
