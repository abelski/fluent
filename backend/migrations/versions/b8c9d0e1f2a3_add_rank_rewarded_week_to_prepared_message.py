"""add rank + rewarded_week to prepared_message (#31)

The column is `reward_rank`, not `rank`: Postgres parses `prepared_message.rank` as the
functional-notation call `rank(prepared_message)` and errors with "WITHIN GROUP is required
for ordered-set aggregate rank". SQLite has no such function, so tests never caught it.

Carries the leaderboard finishing position onto the message, so the send can grant
Premium by rank (leaderboard_service.REWARD_DAYS) instead of a flat week for everyone.

The partial UNIQUE index is the real point: on 2026-09-14 two app instances ran the
weekly job 0.6s apart, both read an empty "already generated" set, and both inserted —
two of the three winners were granted 14 days instead of 7. The index makes that
impossible regardless of how many processes race.

Historical rows are deliberately left with rewarded_week NULL rather than backfilled:
the partial index ignores NULLs, so the existing 2026-09-14 duplicates stay as they are
(those grants were made and are not being clawed back) and only future rows are guarded.

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, Sequence[str], None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('prepared_message', sa.Column('reward_rank', sa.Integer(), nullable=True))
    op.add_column('prepared_message', sa.Column('rewarded_week', sa.Date(), nullable=True))
    op.create_index(
        'uq_prepared_message_user_type_week',
        'prepared_message',
        ['user_id', 'message_type', 'rewarded_week'],
        unique=True,
        postgresql_where=sa.text('rewarded_week IS NOT NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_prepared_message_user_type_week', table_name='prepared_message')
    op.drop_column('prepared_message', 'rewarded_week')
    op.drop_column('prepared_message', 'reward_rank')
