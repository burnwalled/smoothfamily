"""Pantry barcodes: scanning in and stocktaking, and the family's own product list.

Revision ID: 0045_pantry_barcodes
Revises: 0044_local_ai
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0045_pantry_barcodes"
down_revision = "0044_local_ai"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("pantry_items", sa.Column("barcode", sa.String(32), nullable=True))
    op.create_index("ix_pantry_items_barcode", "pantry_items", ["barcode"])
    op.add_column("families", sa.Column("barcode_lookup", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("kiosk_screens", sa.Column("pantry_scan", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "pantry_products",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("barcode", sa.String(32), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("unit", sa.String(20), nullable=False, server_default=""),
        sa.Column("place", sa.String(10), nullable=False, server_default="pantry"),
        sa.Column("keeps_days", sa.Integer(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("family_id", "barcode", name="uq_pantry_product"),
    )


def downgrade() -> None:
    op.drop_table("pantry_products")
    op.drop_column("kiosk_screens", "pantry_scan")
    op.drop_column("families", "barcode_lookup")
    op.drop_index("ix_pantry_items_barcode", "pantry_items")
    op.drop_column("pantry_items", "barcode")
