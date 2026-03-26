"""initial_schema

Revision ID: be15b4e3f2ed
Revises:
Create Date: 2026-03-26 14:03:05.628781

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = 'be15b4e3f2ed'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema — clean up legacy columns/indexes left by the old _run_migrations() approach."""
    op.alter_column('grammar_case_rule', 'status',
               existing_type=sa.VARCHAR(),
               nullable=False,
               existing_server_default=sa.text("'testing'::character varying"))
    op.drop_column('grammar_case_rule', 'is_published')
    op.alter_column('mistake_report', 'description',
               existing_type=sa.TEXT(),
               type_=sqlmodel.sql.sqltypes.AutoString(length=500),
               existing_nullable=False,
               existing_server_default=sa.text("''::text"))
    # Old custom-named indexes — use literal names, not op.f() which applies naming convention
    op.drop_index('idx_mistake_report_status', table_name='mistake_report')
    op.drop_index('idx_mistake_report_user_id', table_name='mistake_report')
    op.create_index(op.f('ix_mistake_report_user_id'), 'mistake_report', ['user_id'], unique=False)
    op.alter_column('practice_test', 'status',
               existing_type=sa.VARCHAR(),
               nullable=False,
               existing_server_default=sa.text("'draft'::character varying"))
    op.create_index(op.f('ix_practice_test_category_id'), 'practice_test', ['category_id'], unique=False)
    op.create_foreign_key(None, 'practice_test', 'user', ['created_by'], ['id'])
    op.alter_column('subcategory_meta', 'status',
               existing_type=sa.VARCHAR(),
               nullable=False,
               existing_server_default=sa.text("'draft'::character varying"))
    op.create_foreign_key(None, 'subcategory_meta', 'user', ['created_by'], ['id'])
    op.drop_column('subcategory_meta', 'is_published')
    op.drop_column('subcategory_meta', 'article_name')
    op.alter_column('user', 'is_premium',
               existing_type=sa.BOOLEAN(),
               nullable=False,
               existing_server_default=sa.text('false'))
    op.alter_column('user', 'is_admin',
               existing_type=sa.BOOLEAN(),
               nullable=False,
               existing_server_default=sa.text('false'))
    op.alter_column('user', 'is_superadmin',
               existing_type=sa.BOOLEAN(),
               nullable=False,
               existing_server_default=sa.text('false'))
    op.alter_column('user_program', 'subcategory_key',
               existing_type=sa.VARCHAR(),
               nullable=False)
    op.create_index(op.f('ix_user_program_subcategory_key'), 'user_program', ['subcategory_key'], unique=False)
    op.create_index(op.f('ix_word_list_item_word_id'), 'word_list_item', ['word_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_word_list_item_word_id'), table_name='word_list_item')
    op.drop_index(op.f('ix_user_program_subcategory_key'), table_name='user_program')
    op.alter_column('user_program', 'subcategory_key',
               existing_type=sa.VARCHAR(),
               nullable=True)
    op.alter_column('user', 'is_superadmin',
               existing_type=sa.BOOLEAN(),
               nullable=True,
               existing_server_default=sa.text('false'))
    op.alter_column('user', 'is_admin',
               existing_type=sa.BOOLEAN(),
               nullable=True,
               existing_server_default=sa.text('false'))
    op.alter_column('user', 'is_premium',
               existing_type=sa.BOOLEAN(),
               nullable=True,
               existing_server_default=sa.text('false'))
    op.add_column('subcategory_meta', sa.Column('article_name', sa.VARCHAR(), autoincrement=False, nullable=True))
    op.add_column('subcategory_meta', sa.Column('is_published', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False))
    op.drop_constraint(None, 'subcategory_meta', type_='foreignkey')
    op.alter_column('subcategory_meta', 'status',
               existing_type=sa.VARCHAR(),
               nullable=True,
               existing_server_default=sa.text("'draft'::character varying"))
    op.drop_constraint(None, 'practice_test', type_='foreignkey')
    op.drop_index(op.f('ix_practice_test_category_id'), table_name='practice_test')
    op.alter_column('practice_test', 'status',
               existing_type=sa.VARCHAR(),
               nullable=True,
               existing_server_default=sa.text("'draft'::character varying"))
    op.drop_index(op.f('ix_mistake_report_user_id'), table_name='mistake_report')
    op.create_index('idx_mistake_report_user_id', 'mistake_report', ['user_id'], unique=False)
    op.create_index('idx_mistake_report_status', 'mistake_report', ['status'], unique=False)
    op.alter_column('mistake_report', 'description',
               existing_type=sqlmodel.sql.sqltypes.AutoString(length=500),
               type_=sa.TEXT(),
               existing_nullable=False,
               existing_server_default=sa.text("''::text"))
    op.add_column('grammar_case_rule', sa.Column('is_published', sa.BOOLEAN(), server_default=sa.text('false'), autoincrement=False, nullable=False))
    op.alter_column('grammar_case_rule', 'status',
               existing_type=sa.VARCHAR(),
               nullable=True,
               existing_server_default=sa.text("'testing'::character varying"))
