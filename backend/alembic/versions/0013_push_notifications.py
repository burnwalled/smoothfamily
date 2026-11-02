"""Phase M: app settings and web push subscriptions.

Revision ID: 0013_push_notifications
Revises: 0012_chat
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa


revision = "0013_push_notifications"
down_revision = "0012_chat"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(length=120), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )

    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("endpoint", sa.Text(), nullable=False),
        sa.Column("p256dh", sa.String(length=500), nullable=False),
        sa.Column("auth", sa.String(length=500), nullable=False),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
    )
    op.create_index("ix_push_subscriptions_user_id", "push_subscriptions", ["user_id"])

    op.add_column(
        "users",
        sa.Column(
            "notification_prefs",
            sa.JSON(),
            nullable=False,
            server_default=sa.text("'{\"chat\": true, \"approvals\": true, \"calendar_mine\": true, \"calendar_family\": false}'"),
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "notification_prefs")

    op.drop_index("ix_push_subscriptions_user_id", table_name="push_subscriptions")
    op.drop_table("push_subscriptions")

    op.drop_table("app_settings")
