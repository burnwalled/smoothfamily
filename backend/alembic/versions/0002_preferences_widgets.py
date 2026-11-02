"""User preferences (language, theme) and dashboard widgets.

Revision ID: 0002
Revises: 0001
Create Date: 2026-06-11
"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("language", sa.String(5), nullable=False, server_default="en"))
    op.add_column("users", sa.Column("theme", sa.String(20), nullable=False, server_default="forest"))
    op.create_table(
        "dashboard_widgets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("type", sa.String(40), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("config", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("dashboard_widgets")
    op.drop_column("users", "theme")
    op.drop_column("users", "language")
