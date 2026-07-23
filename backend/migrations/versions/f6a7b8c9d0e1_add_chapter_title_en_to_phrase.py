"""add_chapter_title_en_to_phrase

Issue #149: chapter titles were stored English-only in `chapter_title`, so Russian
users saw English chapter headers. This adds the second column. The existing rows
were split (English → chapter_title_en, Russian → chapter_title) by a one-off
backfill at the time of this migration; chapter labels are now edited through the
admin panel, with the database as the source of truth.

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-07-23 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('phrase', sa.Column('chapter_title_en', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('phrase', 'chapter_title_en')
