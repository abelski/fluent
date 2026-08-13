"""add_category_to_article

Adds a required `category` column to `article` (one of `learning_materials`,
`adaptation`, `blog`) so /dashboard/articles can group the 29 non-footer
articles into browsable categories. Defaults to `blog` at the DB level for
safety, then backfills the 32 existing rows per the approved mapping
(21 learning_materials / 2 adaptation / 6 blog / 3 utility footer pages stay
`blog` since they're excluded from the category grid via `show_in_footer`).

Revision ID: b3c4d5e6f7a8
Revises: a2b3c4d5e6f7
Create Date: 2026-08-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, Sequence[str], None] = 'a2b3c4d5e6f7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


LEARNING_MATERIALS = [
    'būdvardžiai-linksniavimas', 'common-lithuanian-words',
    'daiktavardžiai-linksniavimas', 'dalyviai-rūšys-ir-linksniavimas',
    'lithuanian-cases-explained', 'numbers-01-basics',
    'numbers-02-nouns-and-prices', 'numbers-03-time', 'numbers-04-ordinal',
    'numbers-05-age-dates-years', 'skaitvardžiai-linksniavimas',
    'veiksmažodžiai-asmenuojama', 'verb-conditional', 'verb-future-tense',
    'verb-governance', 'verb-imperative', 'verb-intro', 'verb-participles',
    'verb-past-tenses', 'verb-present-tense', 'įvardžiai-linksniavimas',
]

ADAPTATION = ['prepare-for-lithuanian-a2', 'regitra-vocabulary']


def upgrade() -> None:
    op.add_column(
        'article',
        sa.Column('category', sa.String(), nullable=False, server_default='blog'),
    )

    article = sa.table('article', sa.column('slug', sa.String), sa.column('category', sa.String))

    op.execute(
        article.update()
        .where(article.c.slug.in_(LEARNING_MATERIALS))
        .values(category='learning_materials')
    )
    op.execute(
        article.update()
        .where(article.c.slug.in_(ADAPTATION))
        .values(category='adaptation')
    )
    # All remaining rows (6 blog articles + 3 utility footer pages) already
    # default to 'blog' from the column default above; no further update needed.


def downgrade() -> None:
    op.drop_column('article', 'category')
