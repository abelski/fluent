"""add_practice_sections_article_theme (#55)

practice_test.section_ru / section_en / is_final and article.theme.
Additive only: is_final is NOT NULL with a server default, so existing rows
and code that doesn't know the column keep working.

Revision ID: a1b2c3d4e5f7
Revises: c9d0e1f2a3b4
Create Date: 2026-09-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a1b2c3d4e5f7'
down_revision: Union[str, Sequence[str], None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('practice_test', sa.Column('section_ru', sa.String(length=120), nullable=True))
    op.add_column('practice_test', sa.Column('section_en', sa.String(length=120), nullable=True))
    op.add_column('practice_test', sa.Column('is_final', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('article', sa.Column('theme', sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column('article', 'theme')
    op.drop_column('practice_test', 'is_final')
    op.drop_column('practice_test', 'section_en')
    op.drop_column('practice_test', 'section_ru')
