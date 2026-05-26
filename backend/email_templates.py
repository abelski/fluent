"""Bilingual email templates for re-engagement messages sent to inactive users."""

from typing import Literal


def generate_reengagement_email(name: str, days_inactive: int, lang: str) -> tuple[str, str]:
    """Return (subject, body) for an inactive-user re-engagement email.

    Uses Russian template when lang=='ru', English otherwise.
    """
    if lang == "ru":
        subject = "Мы скучаем по тебе в Fluent! 🇱🇹"
        body = (
            f"Привет, {name}!\n\n"
            f"Мы заметили, что ты не заходил в Fluent уже {days_inactive} дней. "
            f"Это долго — литовский язык не любит долгих перерывов! 😊\n\n"
            f"Возвращайся и продолжи учить литовский — твой прогресс тебя ждёт:\n"
            f"👉 https://fluent.lt/dashboard\n\n"
            f"⚠️ Важно: если ты не войдёшь в приложение в течение 7 дней с момента "
            f"получения этого письма, мы удалим твой профиль и весь прогресс обучения. "
            f"Просто зайди в приложение — и всё останется на месте.\n\n"
            f"Если у тебя были трудности или вопросы — напиши нам, мы рады помочь.\n\n"
            f"С уважением,\n"
            f"Команда Fluent"
        )
    else:
        subject = "We miss you at Fluent! 🇱🇹"
        body = (
            f"Hi {name},\n\n"
            f"We noticed you haven't visited Fluent for {days_inactive} days. "
            f"That's a long time — Lithuanian doesn't like long breaks! 😊\n\n"
            f"Come back and continue your Lithuanian journey — your progress is waiting:\n"
            f"👉 https://fluent.lt/dashboard\n\n"
            f"⚠️ Important: if you don't log in within 7 days of receiving this email, "
            f"your profile and all learning progress will be permanently deleted. "
            f"Just open the app — and everything will be right where you left it.\n\n"
            f"If you had any difficulties or questions, feel free to reach out — we're happy to help.\n\n"
            f"Best regards,\n"
            f"The Fluent Team"
        )
    return subject, body


def generate_reward_email(name: str, rank: int, lang: str) -> tuple[str, str]:
    """Return (subject, body) for a weekly leaderboard top-3 reward email (1 week premium)."""
    if lang == "ru":
        subject = f"🏆 Вы #{rank} в рейтинге Fluent — вам начислен Premium!"
        body = (
            f"Привет, {name}!\n\n"
            f"Поздравляем — на этой неделе вы заняли #{rank} место в рейтинге Fluent! 🎉\n\n"
            f"В знак признания вашего прогресса мы начисляем вам 1 неделю Fluent Premium.\n"
            f"Это уже активировано в вашем аккаунте — просто зайдите и пользуйтесь:\n"
            f"👉 https://fluent.lt/dashboard\n\n"
            f"Продолжайте учить литовский — вы на верном пути! 🇱🇹\n\n"
            f"С уважением,\n"
            f"Команда Fluent"
        )
    else:
        subject = f"🏆 You're #{rank} on the Fluent leaderboard — Premium granted!"
        body = (
            f"Hi {name},\n\n"
            f"Congratulations — you ranked #{rank} on the Fluent leaderboard this week! 🎉\n\n"
            f"As a reward for your progress, we've granted you 1 week of Fluent Premium.\n"
            f"It's already active on your account — just log in and enjoy:\n"
            f"👉 https://fluent.lt/dashboard\n\n"
            f"Keep learning Lithuanian — you're doing great! 🇱🇹\n\n"
            f"Best regards,\n"
            f"The Fluent Team"
        )
    return subject, body


def generate_notice_email(name: str, rank: int, lang: str) -> tuple[str, str]:
    """Return (subject, body) for a weekly leaderboard top-5 notice email (encourage to reach top 3)."""
    if lang == "ru":
        subject = f"🌟 Вы в топ-5 рейтинга Fluent этой недели!"
        body = (
            f"Привет, {name}!\n\n"
            f"Отличная работа — на этой неделе вы заняли #{rank} место в рейтинге Fluent! 💪\n\n"
            f"Хотите получить Fluent Premium бесплатно? Войдите в топ-3 в следующий раз!\n"
            f"Три лучших пользователя каждой недели получают 1 неделю Premium в подарок.\n\n"
            f"Продолжайте практиковаться:\n"
            f"👉 https://fluent.lt/dashboard\n\n"
            f"С уважением,\n"
            f"Команда Fluent"
        )
    else:
        subject = f"🌟 You're in the Fluent top 5 this week!"
        body = (
            f"Hi {name},\n\n"
            f"Great work — you ranked #{rank} on the Fluent leaderboard this week! 💪\n\n"
            f"Want to earn Fluent Premium for free? Reach the top 3 next time!\n"
            f"Each week's top 3 users receive 1 week of Premium as a gift.\n\n"
            f"Keep practising:\n"
            f"👉 https://fluent.lt/dashboard\n\n"
            f"Best regards,\n"
            f"The Fluent Team"
        )
    return subject, body


_STATUS_COPY_RU = {
    "resolved": "Спасибо! Мы исправили проблему, о которой вы сообщили.",
    "onhold": "Мы получили вашу заявку и пока отложили её — она не забыта и вернётся в работу позже.",
    "open": "Мы вернули вашу заявку в работу и ещё раз её рассмотрим.",
}

_STATUS_COPY_EN = {
    "resolved": "Thanks! We've fixed the issue you reported.",
    "onhold": "We've received your report and put it on hold — it's not forgotten and will return to the queue later.",
    "open": "We've reopened your report and are taking another look.",
}


def generate_report_status_email(
    name: str,
    description: str,
    new_status: Literal["open", "onhold", "resolved"],
) -> tuple[str, str]:
    """Return (subject, body) for a bilingual RU+EN notification sent to a reporter
    when their mistake report changes status."""
    snippet = (description or "").strip()
    if len(snippet) > 200:
        snippet = snippet[:200].rstrip() + "…"

    subject = "Ваша заявка обновлена / Your report was updated"
    body = (
        f"Привет, {name}!\n\n"
        f"{_STATUS_COPY_RU.get(new_status, _STATUS_COPY_RU['open'])}\n\n"
        f"Ваша заявка:\n«{snippet}»\n\n"
        f"Открыть Fluent: https://fluent.lt/dashboard\n\n"
        f"С уважением,\nКоманда Fluent\n\n"
        f"— — —\n\n"
        f"Hi {name},\n\n"
        f"{_STATUS_COPY_EN.get(new_status, _STATUS_COPY_EN['open'])}\n\n"
        f"Your report:\n\"{snippet}\"\n\n"
        f"Open Fluent: https://fluent.lt/dashboard\n\n"
        f"Best regards,\nThe Fluent Team"
    )
    return subject, body
