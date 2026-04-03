"""add_lesson_mode_and_timer_to_user

Revision ID: 708fcc338ca9
Revises: be15b4e3f2ed
Create Date: 2026-03-31 22:01:01.861667

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '708fcc338ca9'
down_revision: Union[str, Sequence[str], None] = 'be15b4e3f2ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('user', sa.Column('lesson_mode', sa.String(), nullable=False, server_default='thorough'))
    op.add_column('user', sa.Column('use_question_timer', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('user', 'use_question_timer')
    op.drop_column('user', 'lesson_mode')
