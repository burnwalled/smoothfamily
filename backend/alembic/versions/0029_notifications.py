"""Notification centre, and whether the menu is grouped on phones / computers.

Revision ID: 0029_notifications
Revises: 0028_app_access
Create Date: 2026-10-27
"""

from alembic import op
import sqlalchemy as sa

revision = "0029_notifications"
down_revision = "0028_app_access"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notifications",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False, server_default=""),
        sa.Column("route", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_notifications_family_id", "notifications", ["family_id"])
    op.create_index("ix_notifications_user_id", "notifications", ["user_id"])
    op.create_index("ix_notifications_created_at", "notifications", ["created_at"])
    op.add_column("users", sa.Column("nav_group_mobile", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("nav_group_desktop", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column("users", "nav_group_desktop")
    op.drop_column("users", "nav_group_mobile")
    op.drop_table("notifications")
