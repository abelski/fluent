"""add_continue_session_settings_to_user

Per-phase item counts and the include-new toggle for the combined
"Продолжить занятие" session (GET /api/me/continue-session).

Counts are nullable — NULL means "use the default of 3", mirroring how
words_per_session/new_words_ratio already treat NULL.
continue_include_new defaults to true: existing users get new content mixed in
as soon as this ships (deliberate behaviour change, confirmed with the user).

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4d5e6f7a8b9'
down_revision: Union[str, Sequence[str], None] = 'b3c4d5e6f7a8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('user', sa.Column('continue_words_count', sa.Integer(), nullable=True))
    op.add_column('user', sa.Column('continue_grammar_count', sa.Integer(), nullable=True))
    op.add_column('user', sa.Column('continue_phrases_count', sa.Integer(), nullable=True))
    op.add_column('user', sa.Column('continue_include_new', sa.Boolean(), nullable=False, server_default='true'))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column('user', 'continue_include_new')
    op.drop_column('user', 'continue_phrases_count')
    op.drop_column('user', 'continue_grammar_count')
    op.drop_column('user', 'continue_words_count')
