"""Receipts in the vault: linked to a home, a vehicle or a category, with warranty and returns.

Revision ID: 0063_receipts
Revises: 0062_feed_member
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0063_receipts"
down_revision = "0062_feed_member"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "receipts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("media_id", sa.Uuid(), sa.ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("store", sa.String(120), nullable=False, server_default=""),
        sa.Column("amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(3), nullable=False, server_default=""),
        sa.Column("purchased_on", sa.Date(), nullable=True),
        sa.Column("category", sa.String(20), nullable=False, server_default="other"),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("vehicle_id", sa.Uuid(), sa.ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("text", sa.Text(), nullable=True),
        sa.Column("warranty_until", sa.Date(), nullable=True),
        sa.Column("return_until", sa.Date(), nullable=True),
        sa.Column("returned_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reminded_return", sa.Date(), nullable=True),
        sa.Column("reminded_warranty", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_receipts_family_id", "receipts", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_receipts_family_id", table_name="receipts")
    op.drop_table("receipts")
