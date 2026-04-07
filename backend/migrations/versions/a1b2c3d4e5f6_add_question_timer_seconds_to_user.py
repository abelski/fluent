"""add_question_timer_seconds_to_user

Revision ID: a1b2c3d4e5f6
Revises: 708fcc338ca9
Create Date: 2026-04-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '708fcc338ca9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('user', sa.Column('question_timer_seconds', sa.Integer(), nullable=False, server_default='5'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('user', 'question_timer_seconds')
