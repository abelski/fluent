"""add_stripe_billing_to_user

Stripe subscription bookkeeping (#11).

All three columns are nullable and purely informational — the entitlement itself
still lives in the pre-existing user.is_premium / user.premium_until columns, read
through quota.is_premium_active(). These record *why* a user has (or lost) premium:

  stripe_customer_id      indexed, because every webhook resolves its user by it
  stripe_subscription_id  cleared on customer.subscription.deleted
  subscription_status     'active' | 'past_due' | 'canceled'; NULL = never subscribed

Existing users (admin-granted premium, weekly leaderboard winners) keep NULL here and
are unaffected — NULL subscription_status deliberately reads as "not a Stripe customer",
not as "cancelled".

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd5e6f7a8b9c0'
down_revision: Union[str, Sequence[str], None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('user', sa.Column('stripe_customer_id', sa.String(), nullable=True))
    op.add_column('user', sa.Column('stripe_subscription_id', sa.String(), nullable=True))
    op.add_column('user', sa.Column('subscription_status', sa.String(), nullable=True))
    op.create_index(op.f('ix_user_stripe_customer_id'), 'user', ['stripe_customer_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_user_stripe_customer_id'), table_name='user')
    op.drop_column('user', 'subscription_status')
    op.drop_column('user', 'stripe_subscription_id')
    op.drop_column('user', 'stripe_customer_id')
