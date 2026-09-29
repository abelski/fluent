"""Balance tips (#57): nudge learners who fully dropped words, phrases or grammar.

Rule, copy and the two-phase send live here; `scheduler.send_balance_tips_job` only
checks the admin switch and calls `send_balance_tips`. See documentation/balance-tips.md.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select, text

import email_service
import inbox_service
import telegram_service
from email_templates import append_premium_upsell
from leaderboard_service import build_leaderboard_score_joins
from models import BalanceTip, User
from quota import is_premium_active

logger = logging.getLogger(__name__)

WINDOW_DAYS = 14
KNOWN_THRESHOLD = 150          # stage 1 of the article: below this, grammar/phrases can wait
SITE = "https://fluent.lt"
ARTICLE_PATH = "/dashboard/articles/how-to-learn-lithuanian-order/"
SETTINGS_PATH = "/dashboard/settings/?tab=other"

# Reason → section. Dict order is the fixed reason/CTA order: grammar → phrases → words.
SECTION_PATHS = {
    "grammar": "/dashboard/grammar",
    "phrases": "/dashboard/phrases",
    "words": "/dashboard/lists",
}

_COPY = {
    "ru": {
        "subject": {
            "grammar": "Не забывайте про грамматику",
            "phrases": "Не забывайте про фразы",
            "words": "Не забывайте про слова",
        },
        "subject_many": "Пара направлений ждёт вас",
        "shares": "За 14 дней: слова {words}%, фразы {phrases}%, грамматика {grammar}%.",
        "why": {
            "grammar": "Грамматика: ни одного урока за две недели, а вы уже знаете больше 150 слов — "
                       "самое время связывать их в предложения.",
            "phrases": "Фразы: ни одной за две недели. Готовые фразы помогают заговорить быстрее, "
                       "чем отдельные слова.",
            "words": "Слова: ни одного за две недели. Словарный запас — основа, на которую опираются "
                     "и грамматика, и фразы.",
        },
        "open": {
            "grammar": "Открыть грамматику",
            "phrases": "Открыть фразы",
            "words": "Открыть слова",
        },
        "cta": {
            "grammar": "К грамматике",
            "phrases": "К фразам",
            "words": "К словам",
        },
        "article": "Почему баланс важен",
        "footer": "Не хотите такие советы? Отключить в настройках",
    },
    "en": {
        "subject": {
            "grammar": "Don't forget grammar",
            "phrases": "Don't forget phrases",
            "words": "Don't forget words",
        },
        "subject_many": "A couple of directions are waiting for you",
        "shares": "Last 14 days: words {words}%, phrases {phrases}%, grammar {grammar}%.",
        "why": {
            "grammar": "Grammar: no lessons in two weeks, and you already know over 150 words — "
                       "the right time to start putting them into sentences.",
            "phrases": "Phrases: none in two weeks. Ready-made phrases get you speaking faster "
                       "than single words.",
            "words": "Words: none in two weeks. Vocabulary is the foundation both grammar and "
                     "phrases build on.",
        },
        "open": {
            "grammar": "Open grammar",
            "phrases": "Open phrases",
            "words": "Open words",
        },
        "cta": {
            "grammar": "Go to grammar",
            "phrases": "Go to phrases",
            "words": "Go to words",
        },
        "article": "Why balance matters",
        "footer": "Don't want these tips? Turn them off in Settings",
    },
}


def _utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def balance_reasons(words: int, phrases: int, grammar: int, known: int) -> list[str]:
    """Dropped directions in the fixed order grammar → phrases → words. Pure."""
    reasons = []
    if grammar == 0 and known > KNOWN_THRESHOLD:
        reasons.append("grammar")
    if phrases == 0 and known > KNOWN_THRESHOLD:
        reasons.append("phrases")
    if words == 0:
        reasons.append("words")
    return reasons


def shares(points: dict) -> dict:
    """`round(100 * part / total)` per direction; all zeros when total is 0."""
    total = points["words"] + points["phrases"] + points["grammar"]
    if total <= 0:
        return {"words": 0, "phrases": 0, "grammar": 0}
    return {k: round(100 * points[k] / total) for k in ("words", "phrases", "grammar")}


def build_copy(lang: str, reasons: list[str], points: dict) -> dict:
    """One language's copy. Keys: subject (= inbox title), body (inbox), email_body,
    cta_label, cta_url. `lang` outside ru/en falls back to ru."""
    c = _COPY.get(lang, _COPY["ru"])
    first = reasons[0]
    subject = c["subject"][first] if len(reasons) == 1 else c["subject_many"]
    shares_line = c["shares"].format(**shares(points))
    why = "\n".join(c["why"][r] for r in reasons)
    article = f"{c['article']}: {SITE}{ARTICLE_PATH}"
    footer = f"{c['footer']}: {SITE}{SETTINGS_PATH}"
    section = f"{c['open'][first]}: {SITE}{SECTION_PATHS[first]}/"
    return {
        "subject": subject,
        # Inbox: the CTA button replaces the section line.
        "body": f"{shares_line}\n\n{why}\n\n{article}\n\n{footer}",
        "email_body": f"{shares_line}\n\n{why}\n\n{section}\n\n{article}\n\n{footer}",
        "cta_label": c["cta"][first],
        "cta_url": SECTION_PATHS[first],
    }


def find_flagged(session: Session, now: datetime) -> list[dict]:
    """Flagged users in one query: 14-day points (practice excluded) + all-time known count,
    minus opt-outs and users tipped within the cooldown. Reasons are applied in Python
    (`balance_reasons`) so the rule has a single definition."""
    joins_sql, params = build_leaderboard_score_joins((now - timedelta(days=WINDOW_DAYS), now))
    rows = session.execute(
        text(f"""
            SELECT u.id AS user_id,
                   COALESCE(w.pts, 0) AS words,
                   COALESCE(p.pts, 0) AS phrases,
                   COALESCE(g.pts, 0) AS grammar,
                   COALESCE(k.n, 0) AS known
            FROM   "user" u
            {joins_sql}
            LEFT JOIN (
                SELECT user_id, COUNT(*) AS n
                FROM   user_word_progress
                WHERE  status = 'known'
                GROUP  BY user_id
            ) k ON k.user_id = u.id
            WHERE  COALESCE(w.pts, 0) + COALESCE(p.pts, 0) + COALESCE(g.pts, 0) > 0
              AND  NOT EXISTS (SELECT 1 FROM balance_tip_opt_out o WHERE o.user_id = u.id)
              AND  NOT EXISTS (SELECT 1 FROM balance_tip bt
                               WHERE bt.user_id = u.id AND bt.sent_on > :cooldown_from)
        """),
        {**params, "cooldown_from": now.date() - timedelta(days=WINDOW_DAYS)},
    ).all()
    flagged = []
    for r in rows:
        points = {"words": int(r.words), "phrases": int(r.phrases), "grammar": int(r.grammar)}
        reasons = balance_reasons(points["words"], points["phrases"], points["grammar"], int(r.known))
        if reasons:
            flagged.append({"user_id": r.user_id, "reasons": reasons, "points": points})
    return flagged


def send_balance_tips(session: Session, now: datetime | None = None) -> dict:
    """Two phases, like #31: claim + inbox then commit, email then commit.

    SMTP can't be rolled back, so the claims (`BalanceTip` rows) are durable before any
    email leaves — a crash mid-send can't cause a resend, and a second app instance
    never waits on uncommitted rows during SMTP. `UNIQUE(user_id, sent_on)` is the
    cross-instance guard: the loser's savepoint rolls back and it skips that user.
    """
    now = now or _utcnow()
    today = now.date()
    claimed: dict[int, dict] = {}      # tip id → flagged entry (reasons + raw points)
    for f in find_flagged(session, now):
        uid, reasons, points = f["user_id"], f["reasons"], f["points"]
        pct = shares(points)
        ru, en = build_copy("ru", reasons, points), build_copy("en", reasons, points)
        try:
            with session.begin_nested():
                tip = BalanceTip(
                    user_id=uid, sent_on=today, reasons=",".join(reasons),
                    words_pct=pct["words"], phrases_pct=pct["phrases"], grammar_pct=pct["grammar"],
                )
                session.add(tip)
                session.flush()
                inbox_service.send(
                    session, [uid], kind="info", source="balance",
                    title_ru=ru["subject"], title_en=en["subject"],
                    body_ru=ru["body"], body_en=en["body"],
                    cta_label_ru=ru["cta_label"], cta_label_en=en["cta_label"],
                    cta_url=ru["cta_url"],
                )
        except IntegrityError:
            logger.info("Balance tips: user %s already tipped on %s — another instance won", uid, today)
            continue
        claimed[tip.id] = f
    session.commit()

    emailed = failed = 0
    if claimed:
        tips = session.exec(select(BalanceTip).where(col(BalanceTip.id).in_(list(claimed)))).all()
        users = {u.id: u for u in session.exec(
            select(User).where(col(User.id).in_([t.user_id for t in tips]))).all()}
        for tip in tips:
            user = users.get(tip.user_id)
            if not user or not user.email_consent:
                continue
            lang = user.lang if user.lang in ("ru", "en") else "ru"
            f = claimed[tip.id]
            copy = build_copy(lang, f["reasons"], f["points"])
            body = append_premium_upsell(copy["email_body"], is_premium_active(user), lang, "generic")
            try:
                email_service.send_email(user.email, copy["subject"], body)
                tip.emailed = True
                session.add(tip)
                emailed += 1
            except Exception as exc:
                failed += 1
                logger.error("Balance tips: email to user %s failed: %s", user.id, exc)
        session.commit()

    result = {"inbox": len(claimed), "email": emailed, "failed": failed}
    logger.info("Balance tips: inbox=%d email=%d failed=%d", *result.values())
    if claimed:
        telegram_service.send_telegram(
            f"⚖️ Balance tips: inbox={len(claimed)} email={emailed} failed={failed}"
        )
    return result
