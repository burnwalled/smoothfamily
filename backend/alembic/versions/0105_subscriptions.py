"""The household's subscriptions (3.4.0), and suggestions from a bank file.

Revision ID: 0105_subscriptions
Revises: 0104_party_surprise
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0105_subscriptions"
down_revision = "0104_party_surprise"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "subscriptions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("category", sa.String(12), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("interval", sa.String(8), nullable=False),
        sa.Column("next_payment", sa.Date(), nullable=True),
        sa.Column("cancel_by", sa.Date(), nullable=True),
        sa.Column("who", sa.String(120), nullable=False, server_default=""),
        sa.Column("url", sa.String(500), nullable=False, server_default=""),
        sa.Column("login_id", sa.Uuid(), sa.ForeignKey("vault_logins.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("private", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("ended_on", sa.Date(), nullable=True),
        sa.Column("pattern", sa.String(80), nullable=True),
        sa.Column("seen_amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("seen_on", sa.Date(), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "subscription_suggestions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("pattern", sa.String(80), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("category", sa.String(12), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("interval", sa.String(8), nullable=False),
        sa.Column("last_seen", sa.Date(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "pattern", name="uq_subscription_suggestion"),
    )


def downgrade() -> None:
    op.drop_table("subscription_suggestions")
    op.drop_table("subscriptions")
