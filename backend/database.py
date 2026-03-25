# Database engine configuration and session factory.
# Uses SQLModel (SQLAlchemy under the hood) with psycopg3 driver to connect
# to a PostgreSQL instance hosted on Neon (serverless Postgres).

import os
import re
from sqlmodel import SQLModel, create_engine, Session
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

if DATABASE_URL:
    # Normalize the URL to use the psycopg3 dialect.
    # Neon / Heroku provide a "postgres://" or "postgresql://" URL but SQLAlchemy
    # needs "postgresql+psycopg://" to pick the psycopg3 driver.
    DATABASE_URL = re.sub(r"^postgres(ql)?://", "postgresql+psycopg://", DATABASE_URL)

    # channel_binding is a psycopg2-only parameter — psycopg3 rejects it,
    # so strip it from the URL if present.
    DATABASE_URL = re.sub(r"[&?]channel_binding=[^&]*", "", DATABASE_URL)

    # Neon requires SSL — append sslmode=require if not already set.
    if "sslmode" not in DATABASE_URL:
        DATABASE_URL += ("&" if "?" in DATABASE_URL else "?") + "sslmode=require"

engine = create_engine(
    DATABASE_URL,
    echo=False,         # Set to True locally to log all SQL queries for debugging
    pool_size=5,        # Keep 5 persistent connections ready
    max_overflow=10,    # Allow up to 10 extra connections under load
    pool_pre_ping=True, # Test connections before use to handle Neon's idle timeouts
)


def create_db_and_tables():
    """Create all tables defined in SQLModel metadata if they don't exist yet.
    Called once at application startup — safe to run on every deploy."""
    SQLModel.metadata.create_all(engine)
    _run_migrations()


def _run_migrations():
    """Apply incremental schema changes that create_all cannot handle (new columns on existing tables).

    Each statement is wrapped in try/except so it is safe to run on every deploy:
    PostgreSQL and SQLite both raise an error if the column already exists — we just ignore it.
    """
    from sqlalchemy import text
    with Session(engine) as s:
        try:
            s.exec(text(
                "ALTER TABLE user_word_progress "
                "ADD COLUMN mistake_count INTEGER NOT NULL DEFAULT 0"
            ))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE word_list ADD COLUMN cefr_level VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE word_list ADD COLUMN difficulty VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE word_list ADD COLUMN article_url VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN article_name VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN article_name_ru VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN article_name_en VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE word_list ADD COLUMN sort_order INTEGER DEFAULT 0"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN sort_order INTEGER DEFAULT 0"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN name_ru VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN name_en VARCHAR"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE grammar_sentence ADD COLUMN use_in_basic BOOLEAN NOT NULL DEFAULT TRUE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE grammar_sentence ADD COLUMN use_in_advanced BOOLEAN NOT NULL DEFAULT TRUE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE grammar_sentence ADD COLUMN use_in_practice BOOLEAN NOT NULL DEFAULT TRUE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE subcategory_meta ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT FALSE"))
            s.exec(text("UPDATE subcategory_meta SET is_published = TRUE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE grammar_case_rule ADD COLUMN is_published BOOLEAN NOT NULL DEFAULT FALSE"))
            s.exec(text("UPDATE grammar_case_rule SET is_published = TRUE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text('ALTER TABLE "user" ADD COLUMN last_login TIMESTAMP'))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text(
                "CREATE TABLE IF NOT EXISTS practice_category ("
                "  id SERIAL PRIMARY KEY,"
                "  name_ru VARCHAR NOT NULL,"
                "  name_en VARCHAR,"
                "  description_ru VARCHAR,"
                "  sort_order INTEGER NOT NULL DEFAULT 0,"
                "  created_at TIMESTAMP NOT NULL DEFAULT NOW()"
                ")"
            ))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE practice_test ADD COLUMN category_id INTEGER REFERENCES practice_category(id)"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE practice_test ADD COLUMN is_premium BOOLEAN NOT NULL DEFAULT FALSE"))
            s.commit()
        except Exception:
            s.rollback()
        try:
            # Seed: create Constitution category and link existing test if not already done
            existing = s.exec(text("SELECT id FROM practice_category WHERE name_ru = 'Конституция'")).first()
            if not existing:
                s.exec(text(
                    "INSERT INTO practice_category (name_ru, name_en, description_ru, sort_order, created_at) "
                    "VALUES ('Конституция', 'Constitution', 'Подготовка к гражданству и ПМЖ', 0, NOW())"
                ))
                s.commit()
            cat = s.exec(text("SELECT id FROM practice_category WHERE name_ru = 'Конституция'")).first()
            if cat:
                s.exec(text("UPDATE practice_test SET category_id = :cat_id WHERE category_id IS NULL AND title_ru ILIKE '%конституц%'").bindparams(cat_id=cat[0]))
                s.commit()
        except Exception:
            s.rollback()
        try:
            s.exec(text("ALTER TABLE article ADD COLUMN show_in_footer BOOLEAN NOT NULL DEFAULT FALSE"))
            s.commit()
        except Exception:
            s.rollback()
        # Seed footer articles (Terms of Service, About Team, GDPR)
        _seed_footer_articles(s)


def _seed_footer_articles(s):
    """Insert the three default footer articles if they don't exist yet."""
    from sqlalchemy import text
    articles = [
        {
            "slug": "terms-of-service",
            "title_ru": "Условия использования",
            "title_en": "Terms of Service",
            "body_ru": (
                "# Условия использования\n\n"
                "**Внимание: платформа находится в стадии разработки.**\n\n"
                "Используя Fluent, вы принимаете следующие условия:\n\n"
                "## Статус платформы\n\n"
                "Fluent в настоящее время находится на стадии активной разработки. "
                "Функциональность, доступность и данные могут изменяться без предварительного уведомления. "
                "Используя платформу, вы делаете это **на свой страх и риск**.\n\n"
                "## Отказ от ответственности\n\n"
                "- Мы не гарантируем непрерывную доступность сервиса.\n"
                "- Данные (словарные списки, прогресс обучения) могут быть сброшены в ходе обновлений.\n"
                "- Платформа предоставляется «как есть» без каких-либо гарантий.\n\n"
                "## Использование\n\n"
                "Сервис предназначен исключительно для личного образовательного использования. "
                "Коммерческое использование запрещено без письменного согласия команды Fluent.\n\n"
                "## Изменения\n\n"
                "Мы оставляем за собой право изменять настоящие условия в любое время. "
                "Продолжение использования платформы означает ваше согласие с актуальными условиями."
            ),
            "body_en": (
                "# Terms of Service\n\n"
                "**Notice: this platform is currently under active development.**\n\n"
                "By using Fluent, you agree to the following terms:\n\n"
                "## Platform Status\n\n"
                "Fluent is in active development. Features, availability, and data may change without notice. "
                "By using the platform you do so **at your own risk**.\n\n"
                "## Disclaimer\n\n"
                "- We do not guarantee uninterrupted availability of the service.\n"
                "- Data (vocabulary lists, learning progress) may be reset during updates.\n"
                "- The platform is provided 'as is' without warranties of any kind.\n\n"
                "## Usage\n\n"
                "The service is intended for personal educational use only. "
                "Commercial use is prohibited without written consent from the Fluent team.\n\n"
                "## Changes\n\n"
                "We reserve the right to modify these terms at any time. "
                "Continued use of the platform constitutes acceptance of the current terms."
            ),
            "tags": "legal",
        },
        {
            "slug": "about-team",
            "title_ru": "О команде",
            "title_en": "About the Team",
            "body_ru": (
                "# О команде\n\n"
                "Fluent — это проект небольшой команды энтузиастов, объединённых одной идеей: "
                "сделать изучение литовского языка доступным и эффективным для всех.\n\n"
                "## Кто мы\n\n"
                "Мы — небольшая группа людей, которые сами проходили через трудности изучения литовского. "
                "Мы знаем, насколько сложной может быть грамматика, как тяжело запоминать новые слова "
                "и как важно иметь качественный инструмент для практики.\n\n"
                "## Наша миссия\n\n"
                "Мы хотим дать каждому возможность уверенно общаться на литовском языке — "
                "будь то для работы, переезда, общения с местными жителями или просто из любви к языку.\n\n"
                "## Что мы делаем\n\n"
                "- Создаём структурированные словарные листы.\n"
                "- Разрабатываем грамматические упражнения на основе реальных правил.\n"
                "- Добавляем интервальное повторение для долгосрочного запоминания.\n"
                "- Публикуем статьи и материалы о литовском языке и культуре.\n\n"
                "## Связаться с нами\n\n"
                "Есть идеи, пожелания или нашли ошибку? Мы будем рады обратной связи. "
                "Пишите нам — вместе мы сделаем Fluent лучше!"
            ),
            "body_en": (
                "# About the Team\n\n"
                "Fluent is a project by a small team of enthusiasts united by one goal: "
                "to make learning Lithuanian accessible and effective for everyone.\n\n"
                "## Who We Are\n\n"
                "We are a small group of people who went through the challenges of learning Lithuanian ourselves. "
                "We know how complex the grammar can be, how hard it is to memorise new words, "
                "and how important it is to have a quality tool for practice.\n\n"
                "## Our Mission\n\n"
                "We want to give everyone the ability to communicate confidently in Lithuanian — "
                "whether for work, relocation, connecting with locals, or simply out of love for the language.\n\n"
                "## What We Do\n\n"
                "- Build structured vocabulary lists.\n"
                "- Develop grammar exercises based on real language rules.\n"
                "- Implement spaced repetition for long-term retention.\n"
                "- Publish articles and materials about the Lithuanian language and culture.\n\n"
                "## Get in Touch\n\n"
                "Have ideas, feedback, or found a bug? We'd love to hear from you. "
                "Reach out — together we can make Fluent even better!"
            ),
            "tags": "about",
        },
        {
            "slug": "privacy-gdpr",
            "title_ru": "Конфиденциальность и GDPR",
            "title_en": "Privacy & GDPR",
            "body_ru": (
                "# Конфиденциальность и GDPR\n\n"
                "Мы уважаем вашу конфиденциальность. Этот документ описывает, "
                "какие данные мы собираем и как их используем.\n\n"
                "## Какие данные мы собираем\n\n"
                "- **Данные Google-аккаунта**: при входе через Google мы получаем ваш email, "
                "имя и идентификатор Google. Эти данные используются исключительно для аутентификации.\n"
                "- **Данные об обучении**: ваши словарные списки, прогресс, результаты упражнений "
                "и история повторений хранятся для обеспечения работы сервиса.\n\n"
                "## Как мы используем данные\n\n"
                "- Для аутентификации и персонализации вашего опыта.\n"
                "- Для отображения вашего прогресса и истории обучения.\n"
                "- Мы не продаём и не передаём ваши данные третьим лицам.\n\n"
                "## Ваши права (GDPR)\n\n"
                "Если вы являетесь резидентом ЕС, у вас есть право:\n"
                "- Получить копию своих данных.\n"
                "- Запросить удаление своей учётной записи и всех связанных данных.\n"
                "- Отозвать согласие на обработку данных.\n\n"
                "Для реализации своих прав свяжитесь с нами.\n\n"
                "## Хранение данных\n\n"
                "Данные хранятся в защищённой базе данных PostgreSQL (Neon). "
                "Мы применяем разумные меры безопасности, однако не можем гарантировать "
                "абсолютную защиту в интернете.\n\n"
                "## Платформа в разработке\n\n"
                "Поскольку платформа находится в стадии разработки, наша политика конфиденциальности "
                "может обновляться. Актуальная версия всегда доступна на этой странице."
            ),
            "body_en": (
                "# Privacy & GDPR\n\n"
                "We respect your privacy. This document describes what data we collect and how we use it.\n\n"
                "## What Data We Collect\n\n"
                "- **Google account data**: when you sign in with Google, we receive your email, "
                "name, and Google ID. This is used solely for authentication.\n"
                "- **Learning data**: your vocabulary lists, progress, exercise results, "
                "and review history are stored to provide the service.\n\n"
                "## How We Use Your Data\n\n"
                "- For authentication and personalising your experience.\n"
                "- To display your progress and learning history.\n"
                "- We do not sell or share your data with third parties.\n\n"
                "## Your Rights (GDPR)\n\n"
                "If you are an EU resident, you have the right to:\n"
                "- Obtain a copy of your data.\n"
                "- Request deletion of your account and all associated data.\n"
                "- Withdraw consent for data processing.\n\n"
                "To exercise your rights, please contact us.\n\n"
                "## Data Storage\n\n"
                "Data is stored in a secured PostgreSQL database (Neon). "
                "We apply reasonable security measures, but cannot guarantee absolute security on the internet.\n\n"
                "## Platform in Development\n\n"
                "As the platform is under development, this privacy policy may be updated. "
                "The current version is always available on this page."
            ),
            "tags": "legal,gdpr,privacy",
        },
    ]
    for a in articles:
        existing = s.exec(text("SELECT id FROM article WHERE slug = :slug").bindparams(slug=a["slug"])).first()
        if not existing:
            s.exec(text(
                "INSERT INTO article (slug, title_ru, title_en, body_ru, body_en, tags, published, show_in_footer, created_at, updated_at) "
                "VALUES (:slug, :title_ru, :title_en, :body_ru, :body_en, :tags, TRUE, TRUE, NOW(), NOW())"
            ).bindparams(**a))
            s.commit()
        else:
            s.exec(text("UPDATE article SET show_in_footer = TRUE WHERE slug = :slug").bindparams(slug=a["slug"]))
            s.commit()


def get_session():
    """FastAPI dependency that yields a DB session per request and auto-closes it."""
    with Session(engine) as session:
        yield session
