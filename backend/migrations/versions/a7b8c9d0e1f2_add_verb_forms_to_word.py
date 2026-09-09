"""add_verb_forms_to_word

Revision ID: a7b8c9d0e1f2
Revises: d5e6f7a8b9c0
Create Date: 2026-09-09 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, Sequence[str], None] = 'd5e6f7a8b9c0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('word', sa.Column('part_of_speech', sa.String(), nullable=True))
    op.add_column('word', sa.Column('verb_present_3p', sa.String(), nullable=True))
    op.add_column('word', sa.Column('verb_past_3p', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('word', 'verb_past_3p')
    op.drop_column('word', 'verb_present_3p')
    op.drop_column('word', 'part_of_speech')
