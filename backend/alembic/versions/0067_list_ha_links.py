"""A list linked to a Home Assistant to-do list, both ways; bought items offered for the pantry.

Revision ID: 0067_list_ha_links
Revises: 0066_receipt_shares
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0067_list_ha_links"
down_revision = "0066_receipt_shares"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("list_items", sa.Column("ha_uid", sa.String(100), nullable=True))
    op.add_column("list_items", sa.Column("pantry_pending", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "list_ha_links",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("list_id", sa.Uuid(), sa.ForeignKey("lists.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("connection_id", sa.Uuid(), sa.ForeignKey("smarthome_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("entity_id", sa.String(200), nullable=False),
        sa.Column("last_sync", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_list_ha_links_family_id", "list_ha_links", ["family_id"])


def downgrade() -> None:
    op.drop_table("list_ha_links")
    op.drop_column("list_items", "pantry_pending")
    op.drop_column("list_items", "ha_uid")
