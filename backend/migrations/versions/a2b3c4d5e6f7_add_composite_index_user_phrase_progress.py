"""add_composite_index_user_phrase_progress

Revision ID: a2b3c4d5e6f7
Revises: f6a7b8c9d0e1
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, Sequence[str], None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        'ix_user_phrase_progress_user_phrase',
        'user_phrase_progress',
        ['user_id', 'phrase_id'],
    )


def downgrade() -> None:
    op.drop_index('ix_user_phrase_progress_user_phrase', table_name='user_phrase_progress')
