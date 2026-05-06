"""add families and user_family_memberships tables

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "families",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("stripe_customer_id", sa.String(length=255), nullable=True),
        sa.Column("stripe_subscription_id", sa.String(length=255), nullable=True),
        sa.Column("tier", sa.String(length=20), nullable=False, server_default="standard"),
        sa.Column("billing_cycle", sa.String(length=20), nullable=False, server_default="monthly"),
        sa.Column(
            "subscription_status",
            sa.String(length=20),
            nullable=False,
            server_default="trialing",
        ),
        sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_paid_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("premium_trial_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("premium_trial_ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "has_used_premium_trial", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("max_members", sa.Integer(), nullable=False, server_default="6"),
        sa.Column(
            "storage_quota_bytes",
            sa.BigInteger(),
            nullable=False,
            server_default="26843545600",
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("stripe_customer_id", name="uq_families_stripe_customer_id"),
        sa.UniqueConstraint("stripe_subscription_id", name="uq_families_stripe_subscription_id"),
    )
    op.create_index("ix_families_owner_user_id", "families", ["owner_user_id"])
    op.create_index("ix_families_stripe_customer_id", "families", ["stripe_customer_id"])
    op.create_index("ix_families_stripe_subscription_id", "families", ["stripe_subscription_id"])

    op.create_table(
        "user_family_memberships",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("family_id", UUID(as_uuid=True), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="parent"),
        sa.Column("display_name", sa.String(length=100), nullable=True),
        sa.Column("color_hex", sa.String(length=7), nullable=True),
        sa.Column("invited_email", sa.String(length=320), nullable=True),
        sa.Column(
            "joined_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
        ),
        sa.UniqueConstraint("user_id", "family_id", name="uq_user_family_membership"),
    )
    op.create_index("ix_user_family_memberships_user_id", "user_family_memberships", ["user_id"])
    op.create_index(
        "ix_user_family_memberships_family_id", "user_family_memberships", ["family_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_user_family_memberships_family_id", table_name="user_family_memberships")
    op.drop_index("ix_user_family_memberships_user_id", table_name="user_family_memberships")
    op.drop_table("user_family_memberships")

    op.drop_index("ix_families_stripe_subscription_id", table_name="families")
    op.drop_index("ix_families_stripe_customer_id", table_name="families")
    op.drop_index("ix_families_owner_user_id", table_name="families")
    op.drop_table("families")
