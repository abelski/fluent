"""add_practice_test_title_lt (#66)

practice_test.title_lt: the Lithuanian original of a test title, shown as a
sub-line under the UI-language title (title_ru / title_en). Additive, nullable —
existing rows and code are unaffected.

Revision ID: a9b0c1d2e3f4
Revises: e3f4a5b6c7d8
Create Date: 2026-10-15 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a9b0c1d2e3f4'
down_revision: Union[str, Sequence[str], None] = 'e3f4a5b6c7d8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('practice_test', sa.Column('title_lt', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('practice_test', 'title_lt')
