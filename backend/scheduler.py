"""Background jobs for Fluent.

Daily at 09:00 UTC  — generate re-engagement drafts for inactive users.
Weekly on Monday 10:00 UTC — generate leaderboard reward/notice drafts and
                              send all pending reward/notice drafts automatically.
"""

import logging
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from sqlmodel import Session, select, text

from database import engine
from email_templates import (
    append_premium_upsell,
    generate_reengagement_email,
    generate_reward_email,
    generate_notice_email,
)
import email_service
import telegram_service
from models import AppSetting, PreparedMessage, User
from quota import is_premium_active

logger = logging.getLogger(__name__)

INACTIVITY_DAYS = 30


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def previous_week_bounds(now: datetime | None = None) -> tuple[datetime, datetime]:
    """Return `[Mon 00:00, next Mon 00:00)` (UTC-naive) of the last **fully completed**
    ISO week relative to `now`.

    Pure function of `now` (defaults to the real current time) so it can be tested
    without a DB or a running clock. Used to anchor the weekly-reward job so it always
    scores the 7 days that just ended, never the in-progress week it started in.
    """
    if now is None:
        now = _utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    this_week_start = today_start - timedelta(days=today_start.weekday())
    prev_week_start = this_week_start - timedelta(days=7)
    return prev_week_start, this_week_start


def _is_auto_send_enabled(session: Session, key: str) -> bool:
    """Return the boolean value of an auto-send toggle setting (default True if not set)."""
    import json as _json
    row = session.exec(select(AppSetting).where(AppSetting.key == key)).first()
    if row is None:
        return True
    return bool(_json.loads(row.value))


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
    """Find users inactive for 30+ days, create messages, and send them immediately."""
    cutoff = _utcnow() - timedelta(days=INACTIVITY_DAYS)
    with Session(engine) as session:
        if not _is_auto_send_enabled(session, "auto_send_inactive_emails"):
            logger.info("Scheduler: inactive-user auto-send is disabled, skipping")
            return
        users = session.exec(select(User)).all()
        sent = failed = 0
        for user in users:
            if not user.email_consent:
                continue

            last_activity = user.last_login or user.created_at
            if last_activity is None or last_activity >= cutoff:
                continue

            # Skip if a message was already sent or drafted for this user
            existing = session.exec(
                select(PreparedMessage).where(
                    PreparedMessage.user_id == user.id,
                    PreparedMessage.status.in_(["draft", "sent"]),
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

            lang = user.lang if user.lang in ("ru", "en") else "ru"
            body = append_premium_upsell(body, is_premium_active(user), lang, "inactive")

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
            session.flush()

            try:
                email_service.send_email(user.email, subject, body)
                msg.status = "sent"
                msg.sent_at = _utcnow()
                sent += 1
            except Exception as exc:
                msg.status = "failed"
                failed += 1
                logger.error("Scheduler: failed to send inactive-user email to %s: %s", user.email, exc)

            session.add(msg)

        session.commit()
        logger.info("Scheduler: inactive-user emails — sent=%d failed=%d", sent, failed)
        if sent or failed:
            telegram_service.send_telegram(
                f"📧 Inactivity emails: sent={sent} failed={failed}"
            )


def generate_weekly_reward_messages(session: Session) -> list[int]:
    """Create reward/notice PreparedMessage drafts for the last completed week's top 5.

    Returns list of IDs of newly created messages. Skips users who already
    have a reward/notice message for the rewarded week or who have not
    consented to emails.
    """
    from leaderboard_service import build_leaderboard_score_joins, LEADERBOARD_SCORE_EXPR

    week_start, week_end = previous_week_bounds()
    joins_sql, params = build_leaderboard_score_joins((week_start, week_end))
    rows = session.execute(
        text(f"""
            SELECT u.id,
                   u.email,
                   u.name,
                   u.lang,
                   u.email_consent,
                   {LEADERBOARD_SCORE_EXPR} AS score
            FROM   "user" u
            {joins_sql}
            WHERE  {LEADERBOARD_SCORE_EXPR} > 0
            ORDER  BY score DESC
            LIMIT  5
        """),
        params,
    ).all()

    existing_msgs = session.exec(
        select(PreparedMessage).where(
            PreparedMessage.message_type.in_(["reward", "notice"]),
            PreparedMessage.created_at >= week_end,
        )
    ).all()
    already_generated: set[str] = {m.user_id for m in existing_msgs}

    new_ids: list[int] = []
    for i, row in enumerate(rows):
        rank = i + 1
        if row.id in already_generated:
            continue
        if not row.email_consent:
            continue
        msg_type = "reward" if rank <= 3 else "notice"
        lang = row.lang if row.lang in ("ru", "en") else "ru"
        if msg_type == "reward":
            subject, body = generate_reward_email(row.name, rank, lang)
        else:
            subject, body = generate_notice_email(row.name, rank, lang)

        user_obj = session.get(User, row.id)
        variant = "convert" if msg_type == "reward" else "generic"
        body = append_premium_upsell(body, is_premium_active(user_obj), lang, variant)

        msg = PreparedMessage(
            user_id=row.id,
            user_email=row.email,
            user_name=row.name,
            user_lang=lang,
            subject=subject,
            body=body,
            status="draft",
            message_type=msg_type,
        )
        session.add(msg)
        session.flush()  # populate msg.id
        new_ids.append(msg.id)

    session.commit()
    return new_ids


def send_weekly_rewards() -> None:
    """Weekly job: generate leaderboard reward/notice drafts and send them.

    Skips users who have not consented to emails (email_consent=False).
    Grants 1 week of premium to reward recipients, same as the manual send endpoint.
    """
    with Session(engine) as session:
        if not _is_auto_send_enabled(session, "auto_send_weekly_rewards"):
            logger.info("Scheduler: weekly rewards auto-send is disabled, skipping")
            return
        new_ids = generate_weekly_reward_messages(session)
        logger.info("Scheduler: generated %d reward/notice drafts", len(new_ids))

        if not new_ids:
            return

        msgs = session.exec(
            select(PreparedMessage).where(
                PreparedMessage.id.in_(new_ids),
                PreparedMessage.status == "draft",
            )
        ).all()

        sent = failed = 0
        for msg in msgs:
            target = session.get(User, msg.user_id)
            # Re-check consent — user may have opted out between generation and sending
            if target and not target.email_consent:
                logger.info("Scheduler: skipping message %d — user %s revoked consent", msg.id, msg.user_id)
                continue
            try:
                email_service.send_email(msg.user_email, msg.subject, msg.body)
                msg.status = "sent"
                msg.sent_at = _utcnow()

                if msg.message_type == "reward" and target:
                    from quota import is_premium_active as _check_premium
                    if _check_premium(target) and target.premium_until is not None:
                        target.premium_until = target.premium_until + timedelta(days=7)
                    else:
                        target.is_premium = True
                        target.premium_until = _utcnow() + timedelta(days=7)
                    session.add(target)

                session.add(msg)
                sent += 1
            except Exception as exc:
                msg.status = "failed"
                session.add(msg)
                failed += 1
                logger.error("Scheduler: failed to send message %d to %s: %s", msg.id, msg.user_email, exc)

        session.commit()
        logger.info("Scheduler: weekly rewards — sent=%d failed=%d", sent, failed)
        telegram_service.send_telegram(
            f"📧 Weekly rewards/notices: sent={sent} failed={failed}"
        )


def start_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler(timezone="UTC")
    scheduler.add_job(generate_inactive_messages, "cron", hour=9, minute=0)
    scheduler.add_job(
        send_weekly_rewards, "cron", day_of_week="mon", hour=10, minute=0,
        misfire_grace_time=3600, coalesce=True,
    )
    scheduler.start()
    logger.info(
        "Scheduler started — inactive-user job daily 09:00 UTC, "
        "weekly rewards job Mondays 10:00 UTC"
    )
    return scheduler
