"""Migration: add article_slug column to grammar_case_rule table.

Allows admins to link each grammar case to a supporting article.
Safe to re-run — uses IF NOT EXISTS.

Run from the backend directory:
    python migrate_add_grammar_article_slug.py
"""

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import text
from database import engine


def main():
    with engine.connect() as conn:
        conn.execute(text(
            "ALTER TABLE grammar_case_rule ADD COLUMN IF NOT EXISTS article_slug VARCHAR;"
        ))
        conn.commit()
    print("Done: article_slug column added to grammar_case_rule.")


if __name__ == "__main__":
    main()
