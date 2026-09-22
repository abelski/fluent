"""One-off (#39): email the word-audio announcement to users who consented to email.

Dry run by default: prints the recipient count and one rendered sample per variant
(RU/EN × free/premium), sends nothing and writes nothing. `--send` actually sends.

Idempotent via an append-only ledger file (`backend/.announcements/audio_2026_09.sent`,
gitignored), one user id per line: a user already in it is skipped, so a rerun only
retries the failures. Deliberately NOT `PreparedMessage` and no DB table (A1-1 / A2-1):
the scheduler reads PreparedMessage rows to skip re-engagement and to flag accounts for
deletion, and a new FK table would break `_delete_user_data`. See documentation/audio.md.

Per user, in order: re-read consent (`session.refresh`), send, append the id to the
ledger and flush. An SMTP failure writes nothing, so the next run retries it.

Usage from the backend directory:
    python scripts/send_audio_announcement.py          # dry run
    python scripts/send_audio_announcement.py --send
"""

import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from dotenv import load_dotenv  # noqa: E402
load_dotenv()

from sqlmodel import Session, select  # noqa: E402

import database  # noqa: E402
import email_service  # noqa: E402
from models import User  # noqa: E402
from quota import is_premium_active  # noqa: E402

LEDGER = Path(__file__).resolve().parent.parent / ".announcements" / "audio_2026_09.sent"
SEND_PAUSE_SECONDS = 1.0

ARTICLE_URL = "https://fluent.lt/dashboard/articles/lithuanian-pronunciation/"
PRICING_URL = "https://fluent.lt/pricing"
LESSONS_URL = "https://fluent.lt/dashboard/lists"
SETTINGS_URL = "https://fluent.lt/dashboard/settings"


def lang_of(user: User) -> str:
    return "ru" if (user.lang or "").lower().startswith("ru") else "en"


def is_premium_variant(user: User) -> bool:
    return bool(user.is_admin or user.is_superadmin or is_premium_active(user))


def render(name: str, lang: str, premium: bool) -> tuple[str, str]:
    """Return (subject, body). Plain text, in the email_templates.py style."""
    if lang == "ru":
        subject = "Fluent теперь произносит слова 🔊"
        cta = (
            "У вас Premium, так что произношение уже включено. Просто откройте урок:\n"
            f"👉 {LESSONS_URL}"
            if premium else
            "Произношение входит в Premium:\n"
            f"👉 {PRICING_URL}"
        )
        body = (
            f"Привет, {name}!\n\n"
            "В Fluent появилось произношение: каждое литовское слово теперь можно послушать.\n"
            "🔊 В уроке слово звучит само, как только появляется карточка (это можно выключить).\n"
            "🔊 Кнопка-динамик есть рядом со словом в уроке, в списках слов и в «Моём словаре».\n\n"
            "О том, почему слушать слова полезно для запоминания, рассказываем в статье:\n"
            f"👉 {ARTICLE_URL}\n\n"
            f"{cta}\n\n"
            "С уважением,\n"
            "Команда Fluent\n\n"
            f"Отключить письма можно в настройках: {SETTINGS_URL}\n"
            "или просто ответьте на это письмо словом «unsubscribe», и мы отключим рассылку."
        )
    else:
        subject = "Fluent now pronounces words 🔊"
        cta = (
            "You have Premium, so it's already on for you. Just open a lesson:\n"
            f"👉 {LESSONS_URL}"
            if premium else
            "Pronunciation is part of Premium:\n"
            f"👉 {PRICING_URL}"
        )
        body = (
            f"Hi {name},\n\n"
            "Fluent can now pronounce words: you can listen to every Lithuanian word.\n"
            "🔊 In a lesson, the word plays as soon as its card appears (you can turn this off).\n"
            "🔊 A speaker button sits next to the word in lessons, word lists and \"My vocabulary\".\n\n"
            "Why listening helps words stick: we wrote about it here.\n"
            f"👉 {ARTICLE_URL}\n\n"
            f"{cta}\n\n"
            "Best regards,\n"
            "The Fluent Team\n\n"
            f"You can turn these emails off in Settings: {SETTINGS_URL}\n"
            "or just reply \"unsubscribe\" and we'll turn emails off for you."
        )
    return subject, body


def _read_ledger(ledger: Path) -> set[str]:
    if not ledger.exists():
        return set()
    return {line.strip() for line in ledger.read_text(encoding="utf-8").splitlines() if line.strip()}


def run(send: bool, ledger: Path = LEDGER, pause: float = SEND_PAUSE_SECONDS, out=print) -> dict[str, int]:
    """Dry run (send=False) or real send. Returns the counts."""
    done = _read_ledger(ledger)
    counts = {"recipients": 0, "sent": 0, "skipped": 0, "failed": 0}

    with Session(database.engine) as session:
        users = session.exec(
            select(User).where(User.email_consent == True).order_by(User.created_at)  # noqa: E712
        ).all()
        pending = [u for u in users if u.id not in done]
        counts["recipients"] = len(pending)
        counts["skipped"] = len(users) - len(pending)

        if not send:
            by_variant: dict[tuple[str, bool], int] = {}
            for u in pending:
                key = (lang_of(u), is_premium_variant(u))
                by_variant[key] = by_variant.get(key, 0) + 1
            out(f"DRY RUN — {len(pending)} recipient(s) with email consent "
                f"({counts['skipped']} already in the ledger {ledger}).")
            for lang in ("ru", "en"):
                for premium in (False, True):
                    subject, body = render("<name>", lang, premium)
                    variant = f"{lang.upper()} / {'premium' if premium else 'free'}"
                    out(f"\n===== {variant}: {by_variant.get((lang, premium), 0)} recipient(s) =====")
                    out(f"Subject: {subject}\n\n{body}")
            out("\nNothing was sent. Re-run with --send to send.")
            return counts

        ledger.parent.mkdir(parents=True, exist_ok=True)
        with ledger.open("a", encoding="utf-8") as f:
            for user in pending:
                session.refresh(user)  # fresh consent read: it may have been withdrawn mid-run
                if not user.email_consent:
                    counts["skipped"] += 1
                    continue
                subject, body = render(user.name, lang_of(user), is_premium_variant(user))
                try:
                    email_service.send_email(user.email, subject, body)
                except Exception as e:  # nothing written → the next run retries this user
                    counts["failed"] += 1
                    out(f"FAILED user={user.id}: {type(e).__name__}")
                    continue
                f.write(f"{user.id}\n")
                f.flush()
                counts["sent"] += 1
                if pause:
                    time.sleep(pause)

    out(f"sent={counts['sent']} skipped={counts['skipped']} failed={counts['failed']}")
    return counts


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--send", action="store_true", help="actually send (default: dry run)")
    args = parser.parse_args()
    run(send=args.send)


if __name__ == "__main__":
    main()
