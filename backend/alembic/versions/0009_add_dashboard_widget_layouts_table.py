"""add dashboard widget layouts table

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-06
"""

import sqlalchemy as sa

from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "dashboard_widget_layouts",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("family_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("widget_type", sa.String(length=80), nullable=False),
        sa.Column("size", sa.String(length=20), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("is_visible", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "family_id",
            "user_id",
            "widget_type",
            name="uq_dashboard_widget_layout_family_user_type",
        ),
    )
    op.create_index(
        "ix_dashboard_widget_layouts_family_id",
        "dashboard_widget_layouts",
        ["family_id"],
    )
    op.create_index(
        "ix_dashboard_widget_layouts_user_id",
        "dashboard_widget_layouts",
        ["user_id"],
    )
    op.create_index(
        "ix_dashboard_widget_layouts_widget_type",
        "dashboard_widget_layouts",
        ["widget_type"],
    )


def downgrade() -> None:
    op.drop_index("ix_dashboard_widget_layouts_widget_type", table_name="dashboard_widget_layouts")
    op.drop_index("ix_dashboard_widget_layouts_user_id", table_name="dashboard_widget_layouts")
    op.drop_index("ix_dashboard_widget_layouts_family_id", table_name="dashboard_widget_layouts")
    op.drop_table("dashboard_widget_layouts")
