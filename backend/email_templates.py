"""Bilingual email templates for re-engagement messages sent to inactive users."""


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
            f"⚠️ Обрати внимание: если аккаунт долго не используется, мы можем удалить "
            f"данные профиля и весь прогресс обучения. Чтобы сохранить свои результаты — "
            f"просто зайди в приложение.\n\n"
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
            f"⚠️ Please note: accounts that remain inactive for an extended period may have "
            f"their profile data and learning progress removed. Log in to keep your results safe.\n\n"
            f"If you had any difficulties or questions, feel free to reach out — we're happy to help.\n\n"
            f"Best regards,\n"
            f"The Fluent Team"
        )
    return subject, body
