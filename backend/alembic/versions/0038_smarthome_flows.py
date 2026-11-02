"""Personal automations (flows) in the Smart home app.

Revision ID: 0038_smarthome_flows
Revises: 0037_presence
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0038_smarthome_flows"
down_revision = "0037_presence"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "smarthome_flows",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("owner_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("shared", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("approved", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("on_today", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("trigger", sa.JSON(), nullable=False),
        sa.Column("conditions", sa.JSON(), nullable=False),
        sa.Column("actions", sa.JSON(), nullable=False),
        sa.Column("last_run_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("smarthome_flows")
