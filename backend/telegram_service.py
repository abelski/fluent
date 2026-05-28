# Telegram bot notifier for admin alerts.
# Sends one-way push messages to the admin's Telegram chat.
#
# Required env vars (set in .env and Render dashboard):
#   TELEGRAM_BOT_TOKEN  — token from @BotFather, e.g. "123456:ABC-DEF..."
#   TELEGRAM_CHAT_ID    — admin's personal chat ID (get it from @userinfobot)
#
# If either var is unset the function silently no-ops so local dev without
# credentials never breaks.

import logging
import os

import httpx

logger = logging.getLogger(__name__)

_TELEGRAM_API = "https://api.telegram.org/bot{token}/sendMessage"


def send_telegram(text: str) -> None:
    token = os.getenv("TELEGRAM_BOT_TOKEN")
    chat_id = os.getenv("TELEGRAM_CHAT_ID")
    if not token or not chat_id:
        return
    try:
        url = _TELEGRAM_API.format(token=token)
        httpx.post(url, json={"chat_id": chat_id, "text": text}, timeout=5)
    except Exception:
        logger.exception("Telegram notification failed")
