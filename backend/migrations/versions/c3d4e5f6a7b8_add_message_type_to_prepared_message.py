"""add_message_type_to_prepared_message

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-05-07 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add message_type column to prepared_message, backfill existing rows as 'reengagement'."""
    op.add_column(
        'prepared_message',
        sa.Column('message_type', sa.String(), nullable=False, server_default='reengagement'),
    )


def downgrade() -> None:
    """Remove message_type column from prepared_message."""
    op.drop_column('prepared_message', 'message_type')
