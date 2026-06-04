"""add_freq_rank_theme_to_verb

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-03 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('verb', sa.Column('freq_rank', sa.Integer(), nullable=True))
    op.add_column('verb', sa.Column('theme', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('verb', 'theme')
    op.drop_column('verb', 'freq_rank')
