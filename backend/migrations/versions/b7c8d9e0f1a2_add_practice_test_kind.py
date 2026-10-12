"""add_practice_test_kind (#62c)

practice_test.kind: 'choice' (sampled, shuffled) or 'dialogue' (all turns, in order).
Additive only: NOT NULL with a server default, so code that doesn't know the
column keeps working.

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f7
Create Date: 2026-10-11 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('practice_test', sa.Column('kind', sa.String(length=20), nullable=False, server_default='choice'))


def downgrade() -> None:
    op.drop_column('practice_test', 'kind')
