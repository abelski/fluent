"""add_composite_index_user_word_progress

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_user_word_progress_user_word',
        'user_word_progress',
        ['user_id', 'word_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_user_word_progress_user_word', table_name='user_word_progress')
