"""add_practice_question_image (#62e)

practice_question.image_url / image_credit: optional sign/notice photo and its
attribution. Additive, nullable — existing rows and code are unaffected.

Revision ID: e3f4a5b6c7d8
Revises: b7c8d9e0f1a2
Create Date: 2026-10-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e3f4a5b6c7d8'
down_revision: Union[str, Sequence[str], None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('practice_question', sa.Column('image_url', sa.String(length=300), nullable=True))
    op.add_column('practice_question', sa.Column('image_credit', sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column('practice_question', 'image_credit')
    op.drop_column('practice_question', 'image_url')
