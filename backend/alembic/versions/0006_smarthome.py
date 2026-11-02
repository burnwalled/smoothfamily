"""Smart home integration tables.

Revision ID: 0006
Revises: 0005
Create Date: 2026-06-12
"""
from alembic import op
import sqlalchemy as sa

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "smarthome_connections",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, unique=True, index=True),
        sa.Column("provider", sa.String(30), nullable=False),  # home_assistant
        sa.Column("base_url", sa.String(500), nullable=False),
        sa.Column("token_encrypted", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "exposed_devices",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("connection_id", sa.Uuid(), sa.ForeignKey("smarthome_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_id", sa.String(200), nullable=False),
        sa.Column("display_name", sa.String(200), nullable=False),
        sa.Column("domain", sa.String(40), nullable=False),  # light, switch, cover
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("allowed_user_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("exposed_devices")
    op.drop_table("smarthome_connections")
