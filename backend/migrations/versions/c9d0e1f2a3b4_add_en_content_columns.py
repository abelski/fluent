"""add_en_content_columns (#48b)

Nullable EN twins for admin-authored content that only had Russian.
Additive only: code that doesn't know these columns keeps working.

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-09-24 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, Sequence[str], None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_COLUMNS = [
    ('practice_category', 'description_en'),
    ('grammar_program', 'description_en'),
    ('grammar_case_rule', 'name_en'),
    ('grammar_case_rule', 'question_en'),
    ('grammar_case_rule', 'usage_en'),
    ('grammar_case_rule', 'transform_en'),
    ('grammar_case_rule', 'endings_sg_en'),
    ('grammar_case_rule', 'endings_pl_en'),
    ('grammar_sentence', 'english'),
    ('verb', 'translation_en'),
]


def upgrade() -> None:
    for table, column in _COLUMNS:
        op.add_column(table, sa.Column(column, sa.String(), nullable=True))


def downgrade() -> None:
    for table, column in reversed(_COLUMNS):
        op.drop_column(table, column)
