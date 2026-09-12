"""In-app inbox write path and cached reads (#23).

Everything that can put a message in a user's inbox goes through `send()`: the
admin composer, milestone achievements, the leaderboard reward/notice, report
status changes and the Premium welcome. `send()` never commits — the caller's
transaction owns that, so an inbox write can't half-land.

Reads go through `backend/cache.py` (#24). Neon caps network transfer and each
round trip costs ~0.2–0.3s in production (documentation/production-db-latency.md),
so a warm `GET /me/inbox*` issues **zero** statements: the user's delivery flag
rows and each message's text are cached separately, tagged per user / per message
id so a write only evicts what it actually touched. There is no cache plumbing in
this module — no dicts, no locks, no listeners; see documentation/inbox.md.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Iterable, Optional, Sequence

from sqlalchemy import delete as sa_delete, insert as sa_insert
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlmodel import Session, col, select

import cache
from constants import DEFAULT_CEFR_THRESHOLDS
from models import AppSetting, InboxDelivery, InboxMessage, UserAchievement
from quota import is_premium_active

logger = logging.getLogger(__name__)

KINDS = ("info", "celebration", "offer")
SOURCES = ("admin", "achievement", "leaderboard", "report", "premium")

SNIPPET_CHARS = 120
DELIVERIES_TTL = 300          # 5 min safety net; every write is tagged for its user


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ── Write path ───────────────────────────────────────────────────────────────

def send(
    session: Session,
    user_ids: Sequence[str],
    *,
    kind: str,
    source: str,
    title_ru: str,
    title_en: str,
    body_ru: str = "",
    body_en: str = "",
    cta_label_ru: Optional[str] = None,
    cta_label_en: Optional[str] = None,
    cta_url: Optional[str] = None,
    audience: Optional[str] = None,
) -> tuple[Optional[int], int]:
    """Create one message and fan it out to `user_ids`. Returns `(message_id, recipients)`.

    Does **not** commit. One message INSERT plus one bulk delivery INSERT, whatever
    the recipient count — never a per-user loop (a broadcast to "all" is ~150 rows).
    """
    recipients = list(dict.fromkeys(user_ids))
    if not recipients:
        return None, 0

    message = InboxMessage(
        kind=kind,
        source=source,
        title_ru=title_ru,
        title_en=title_en,
        body_ru=body_ru,
        body_en=body_en,
        cta_label_ru=cta_label_ru,
        cta_label_en=cta_label_en,
        cta_url=cta_url,
        audience=audience,
    )
    session.add(message)
    session.flush()  # populate message.id

    now = _utcnow()
    session.execute(
        sa_insert(InboxDelivery.__table__).execution_options(
            # Narrow the eviction to the recipients. A bare Core INSERT would emit
            # `inbox_delivery:*` and throw away every other user's cached inbox.
            cache_tags={f"inbox_delivery:user={uid}" for uid in recipients}
        ),
        [
            {"message_id": message.id, "user_id": uid, "read_at": None,
             "deleted_at": None, "created_at": now}
            for uid in recipients
        ],
    )
    return message.id, len(recipients)


# ── Cached reads ─────────────────────────────────────────────────────────────

def _delivery_rows(session: Session, user_id: str) -> list[dict]:
    """Every delivery of `user_id`, newest first — ids and flags only, no text."""
    def _load() -> list[dict]:
        rows = session.execute(
            select(
                InboxDelivery.id,
                InboxDelivery.message_id,
                InboxDelivery.read_at,
                InboxDelivery.deleted_at,
                InboxDelivery.created_at,
            )
            .where(InboxDelivery.user_id == user_id)
            .order_by(col(InboxDelivery.created_at).desc(), col(InboxDelivery.id).desc())
        ).all()
        return [
            {"id": r[0], "message_id": r[1], "read_at": r[2],
             "deleted_at": r[3], "created_at": r[4]}
            for r in rows
        ]

    return cache.get_or_load(
        ("inbox_deliveries", user_id),
        _load,
        tags={f"inbox_delivery:user={user_id}"},
        ttl=DELIVERIES_TTL,
    )


def _message_content(session: Session, message_ids: Iterable[int]) -> dict[int, dict]:
    """Cached message text, one `WHERE id IN (…)` for whatever isn't cached yet.

    Messages are immutable after send, so the only invalidation is retract (a Core
    delete, which evicts table-wide).
    """
    wanted = list(dict.fromkeys(message_ids))
    found: dict[int, dict] = {}
    misses: list[int] = []

    for mid in wanted:
        def _miss(mid: int = mid):
            misses.append(mid)
            return None

        hit = cache.get_or_load(
            ("inbox_message", mid),
            _miss,
            tags={f"inbox_message:pk={mid}"},
            store_if=lambda v: False,   # a miss must never cache None
        )
        if hit is not None:
            found[mid] = hit

    if misses:
        rows = session.execute(
            select(
                InboxMessage.id, InboxMessage.kind, InboxMessage.source,
                InboxMessage.title_ru, InboxMessage.title_en,
                InboxMessage.body_ru, InboxMessage.body_en,
                InboxMessage.cta_label_ru, InboxMessage.cta_label_en, InboxMessage.cta_url,
            ).where(col(InboxMessage.id).in_(misses))
        ).all()
        fetched = {
            r[0]: {
                "kind": r[1], "source": r[2], "title_ru": r[3], "title_en": r[4],
                "body_ru": r[5], "body_en": r[6],
                "cta_label_ru": r[7], "cta_label_en": r[8], "cta_url": r[9],
            }
            for r in rows
        }
        for mid in misses:
            value = fetched.get(mid)
            if value is None:
                continue            # retracted between the two reads
            found[mid] = cache.get_or_load(
                ("inbox_message", mid),
                lambda value=value: value,
                tags={f"inbox_message:pk={mid}"},
            )
    return found


def _visible(rows: list[dict]) -> list[dict]:
    return [r for r in rows if r["deleted_at"] is None]


def _snippet(text: str) -> str:
    flat = " ".join((text or "").split())
    return flat if len(flat) <= SNIPPET_CHARS else flat[:SNIPPET_CHARS].rstrip() + "…"


def unread_count(session: Session, user_id: str) -> int:
    return sum(1 for r in _delivery_rows(session, user_id) if r["read_at"] is None and r["deleted_at"] is None)


def get_inbox(session: Session, user_id: str, limit: int, offset: int) -> dict:
    """One page of the user's inbox, newest first. Snippets only — never full bodies.

    # ponytail: pages in memory over the user's cached flag rows (~50 bytes each).
    # Move paging into SQL only if a user ever exceeds ~5k deliveries.
    """
    rows = _delivery_rows(session, user_id)
    visible = _visible(rows)
    page = visible[offset:offset + limit]
    content = _message_content(session, [r["message_id"] for r in page])

    items = []
    for r in page:
        msg = content.get(r["message_id"])
        if msg is None:
            continue
        items.append({
            "id": r["id"],
            "kind": msg["kind"],
            "source": msg["source"],
            "title_ru": msg["title_ru"],
            "title_en": msg["title_en"],
            "snippet_ru": _snippet(msg["body_ru"]),
            "snippet_en": _snippet(msg["body_en"]),
            "created_at": r["created_at"],
            "read": r["read_at"] is not None,
        })
    return {
        "items": items,
        "has_more": len(visible) > offset + limit,
        "unread": sum(1 for r in visible if r["read_at"] is None),
    }


def get_delivery(session: Session, user_id: str, delivery_id: int) -> Optional[dict]:
    """Full content of one of the caller's deliveries, or None if it isn't theirs / is deleted."""
    row = next(
        (r for r in _delivery_rows(session, user_id)
         if r["id"] == delivery_id and r["deleted_at"] is None),
        None,
    )
    if row is None:
        return None
    msg = _message_content(session, [row["message_id"]]).get(row["message_id"])
    if msg is None:
        return None
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "read": row["read_at"] is not None,
        **msg,
    }


# ── Bilingual copy ───────────────────────────────────────────────────────────
# Plain text only; no markdown, no HTML. CTA urls are always internal paths.

PREMIUM_CTA = {"cta_label_ru": "Premium", "cta_label_en": "Premium", "cta_url": "/pricing"}

STREAK_MILESTONES = (7, 30, 100, 365)
WORD_MILESTONES = (100, 250)   # stops at 250: the CEFR thresholds (500/1000/2000…) take over
PHRASE_MILESTONE = 100


def _achievement_copy() -> dict[str, dict[str, str]]:
    copy: dict[str, dict[str, str]] = {}
    for n in STREAK_MILESTONES:
        copy[f"streak:{n}"] = {
            "title_ru": f"Серия {n} дней",
            "title_en": f"{n}-day streak",
            "body_ru": f"Вы занимались {n} дней подряд. Регулярность — главное в изучении языка, так держать!",
            "body_en": f"You have studied {n} days in a row. Consistency is what makes a language stick — keep going!",
        }
    for n in WORD_MILESTONES:
        copy[f"words:{n}"] = {
            "title_ru": f"{n} выученных слов",
            "title_en": f"{n} words learned",
            "body_ru": f"Вы выучили {n} слов. Это уже заметный словарный запас — продолжайте в том же духе.",
            "body_en": f"You have learned {n} words. That is a real vocabulary already — keep it up.",
        }
    for level in ("A1", "A2", "B1", "B2", "C1", "C2"):
        copy[f"cefr:{level}"] = {
            "title_ru": f"Уровень {level}",
            "title_en": f"Level {level} reached",
            "body_ru": f"Ваш словарный запас достиг уровня {level}. Поздравляем с новой ступенью!",
            "body_en": f"Your vocabulary has reached level {level}. Congratulations on the new step!",
        }
    copy["grammar:first"] = {
        "title_ru": "Первый урок грамматики пройден",
        "title_en": "First grammar lesson passed",
        "body_ru": "Вы прошли первый урок грамматики. Падежи — самая сложная часть литовского, и вы уже начали.",
        "body_en": "You passed your first grammar lesson. Cases are the hardest part of Lithuanian, and you have started.",
    }
    copy["exam:first"] = {
        "title_ru": "Первый экзамен пройден",
        "title_en": "First practice exam completed",
        "body_ru": "Вы прошли первый пробный экзамен. Так проверяют себя перед настоящим — отличное начало.",
        "body_en": "You completed your first practice exam. That is exactly how you check yourself before the real one.",
    }
    copy[f"phrases:{PHRASE_MILESTONE}"] = {
        "title_ru": f"{PHRASE_MILESTONE} фраз выучено",
        "title_en": f"{PHRASE_MILESTONE} phrases learned",
        "body_ru": f"Вы выучили {PHRASE_MILESTONE} фраз. Именно фразы быстрее всего превращаются в живую речь.",
        "body_en": f"You have learned {PHRASE_MILESTONE} phrases. Phrases are what turn into real speech the fastest.",
    }
    return copy


ACHIEVEMENT_COPY = _achievement_copy()

LEADERBOARD_COPY = {
    "reward": {
        "title_ru": "Вы в тройке лидеров недели",
        "title_en": "You are in this week's top 3",
        "body_ru": "Поздравляем! Вы вошли в тройку лидеров рейтинга за прошлую неделю и получаете 7 дней Premium.",
        "body_en": "Congratulations! You finished in last week's top 3 and have been given 7 days of Premium.",
    },
    "notice": {
        "title_ru": "Вы в пятёрке лидеров недели",
        "title_en": "You are in this week's top 5",
        "body_ru": "Вы вошли в пятёрку лидеров рейтинга за прошлую неделю. Ещё немного — и будете в тройке.",
        "body_en": "You finished in last week's top 5. A little more and you will be in the top 3.",
    },
}

REPORT_STATUS_COPY = {
    "open": {
        "title_ru": "Ваше сообщение об ошибке открыто",
        "title_en": "Your mistake report is open",
        "body_ru": "Мы вернули ваше сообщение в работу и разбираемся с ним.",
        "body_en": "We have reopened your report and are looking into it.",
    },
    "onhold": {
        "title_ru": "Ваше сообщение об ошибке отложено",
        "title_en": "Your mistake report is on hold",
        "body_ru": "Мы отложили ваше сообщение: оно требует более долгой проверки. Мы вернёмся к нему.",
        "body_en": "We have put your report on hold — it needs a longer check. We will come back to it.",
    },
    "resolved": {
        "title_ru": "Ваше сообщение об ошибке исправлено",
        "title_en": "Your mistake report is resolved",
        "body_ru": "Спасибо! Мы исправили то, о чём вы сообщили.",
        "body_en": "Thank you! We have fixed what you reported.",
    },
}

PREMIUM_WELCOME_COPY = {
    "title_ru": "Premium активирован",
    "title_en": "Premium is active",
    "body_ru": (
        "Спасибо за поддержку! Теперь вам доступны безлимитные занятия, премиум-уроки грамматики "
        "и все пробные экзамены."
    ),
    "body_en": (
        "Thank you for your support! Unlimited sessions, premium grammar lessons and every practice "
        "exam are now open to you."
    ),
}


# ── Automatic messages ───────────────────────────────────────────────────────

def _cefr_thresholds(session: Session) -> list[dict]:
    """CEFR thresholds, sharing #24 row 21's cache entry with the admin endpoint."""
    value = cache.get_or_load(
        ("setting", "cefr_thresholds"),
        lambda: next(
            iter(session.execute(
                select(AppSetting.value).where(AppSetting.key == "cefr_thresholds")
            ).scalars().all()),
            None,
        ),
        tags={"app_setting"},
        store_if=lambda v: v is not None,
    )
    if not value:
        return DEFAULT_CEFR_THRESHOLDS
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return DEFAULT_CEFR_THRESHOLDS


def _awarded_keys(session: Session, user_id: str) -> set[str]:
    return cache.get_or_load(
        ("achievements", user_id),
        lambda: set(session.execute(
            select(UserAchievement.key).where(UserAchievement.user_id == user_id)
        ).scalars().all()),
        tags={f"user_achievement:user={user_id}"},
    )


def _reached_keys(session: Session, stats: dict[str, Any]) -> set[str]:
    keys: set[str] = set()
    known = stats.get("known") or 0
    for n in STREAK_MILESTONES:
        if (stats.get("streak") or 0) >= n:
            keys.add(f"streak:{n}")
    for n in WORD_MILESTONES:
        if known >= n:
            keys.add(f"words:{n}")
    for entry in _cefr_thresholds(session):
        level, threshold = entry.get("level"), entry.get("threshold") or 0
        if level and level != "0" and threshold > 0 and known >= threshold:
            keys.add(f"cefr:{level}")
    if (stats.get("grammar_lessons_passed") or 0) >= 1:
        keys.add("grammar:first")
    if (stats.get("practice_exams_completed") or 0) >= 1:
        keys.add("exam:first")
    if (stats.get("phrases_learned") or 0) >= PHRASE_MILESTONE:
        keys.add(f"phrases:{PHRASE_MILESTONE}")
    return keys & set(ACHIEVEMENT_COPY)


def _record_keys(session: Session, user_id: str, keys: Iterable[str]) -> set[str]:
    """`INSERT … ON CONFLICT DO NOTHING RETURNING key`. Returns what this call actually won.

    The unique constraint is the race guard: two concurrent /me/stats calls both
    insert, and only one of them gets the key back — so a milestone can never be
    celebrated twice.
    """
    rows = sorted(set(keys))
    if not rows:
        return set()
    dialect = session.get_bind().dialect.name
    insert = pg_insert if dialect == "postgresql" else sqlite_insert
    now = _utcnow()
    stmt = (
        insert(UserAchievement.__table__)
        .values([{"user_id": user_id, "key": k, "created_at": now} for k in rows])
        .on_conflict_do_nothing(index_elements=["user_id", "key"])
        .returning(UserAchievement.__table__.c.key)
        .execution_options(cache_tags={f"user_achievement:user={user_id}"})
    )
    return set(session.execute(stmt).scalars().all())


def award_achievements(session: Session, user, stats: dict[str, Any]) -> int:
    """Award any newly-reached milestones and inbox one message per award.

    Called from `GET /me/stats` using values it already computed, so in steady
    state (nothing new) this adds **zero** DB round trips: both the awarded-key
    ledger and the CEFR thresholds come from the cache.

    A user with no ledger rows at all is seeing their first evaluation: everything
    already reached is recorded silently (plus `_init`), so pre-feature users don't
    get a retroactive flood, while a brand-new account — which has reached nothing
    yet — still gets every later milestone celebrated.

    Unlike `send()`, this one **does** commit — but only on the calls that actually
    wrote something. `GET /me/stats` has no other pending writes, and the ledger has
    to persist on the grandfathering call too, or every later call would grandfather
    again and no milestone would ever be celebrated.
    """
    user_id = user.id                    # capture before the commit (#22: expire_on_commit)
    premium = is_premium_active(user)
    reached = _reached_keys(session, stats)
    existing = _awarded_keys(session, user_id)

    if not existing:
        _record_keys(session, user_id, reached | {"_init"})
        session.commit()
        return 0

    pending = reached - existing
    if not pending:
        return 0

    awarded = _record_keys(session, user_id, pending)
    cta = {} if premium else PREMIUM_CTA
    sent = 0
    for key in sorted(awarded):
        copy = ACHIEVEMENT_COPY.get(key)
        if copy:
            send(session, [user_id], kind="celebration", source="achievement", **copy, **cta)
            sent += 1
    session.commit()
    return sent


def notify_leaderboard(session: Session, user_id: str, message_type: str) -> None:
    """Inbox mirror of the weekly leaderboard reward/notice email.

    Shared by `admin.py::send_prepared_message` and `scheduler.py::send_weekly_rewards`
    so the manual and automatic paths can't drift. Never raises — a failed inbox
    write must not abort the surrounding send (same stance as `_notify_reporter`).
    """
    copy = LEADERBOARD_COPY.get(message_type)
    if not copy:
        return
    try:
        send(session, [user_id], kind="celebration", source="leaderboard",
             **copy, cta_label_ru="Открыть рейтинг", cta_label_en="Open leaderboard",
             cta_url="/")
    except Exception:
        logger.exception("Inbox: failed to send leaderboard %s to %s", message_type, user_id)


def notify_report_status(session: Session, report, new_status: str) -> None:
    """Inbox mirror of the report-status email. Sent regardless of email consent."""
    copy = REPORT_STATUS_COPY.get(new_status)
    if not copy or not report.user_id:
        return
    excerpt = (report.description or "").strip()[:200]
    body_ru = f"{copy['body_ru']}\n\nВаше сообщение: «{excerpt}»" if excerpt else copy["body_ru"]
    body_en = f"{copy['body_en']}\n\nYour report: “{excerpt}”" if excerpt else copy["body_en"]
    try:
        send(session, [report.user_id], kind="info", source="report",
             title_ru=copy["title_ru"], title_en=copy["title_en"],
             body_ru=body_ru, body_en=body_en)
    except Exception:
        logger.exception("Inbox: failed to send report status %s to %s", new_status, report.user_id)


def notify_premium_welcome(session: Session, user) -> None:
    """Celebration message for a Premium activation (Stripe checkout or admin grant).

    Takes a `User` **or** a plain user id: the Stripe webhook has to capture the id
    *before* its entitlement commit (#22 — touching an ORM object afterwards silently
    re-SELECTs the whole row), and by the time it calls this it only holds the string.
    """
    user_id = user if isinstance(user, str) else user.id
    try:
        send(session, [user_id], kind="celebration", source="premium",
             **PREMIUM_WELCOME_COPY,
             cta_label_ru="В личный кабинет", cta_label_en="Go to dashboard",
             cta_url="/dashboard")
    except Exception:
        logger.exception("Inbox: failed to send premium welcome to %s", user_id)


def purge_deleted(session: Session, older_than_hours: int = 24) -> int:
    """Hard-delete rows soft-deleted more than `older_than_hours` ago. Does not commit."""
    cutoff = _utcnow() - timedelta(hours=older_than_hours)
    result = session.execute(
        sa_delete(InboxDelivery.__table__).where(InboxDelivery.__table__.c.deleted_at < cutoff)
    )
    return result.rowcount or 0
