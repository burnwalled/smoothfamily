"""Vehicles of every kind: types, engine hours, tyres, charging, purchase, HA meter, documents.

Revision ID: 0049_vehicle_kinds
Revises: 0048_vehicles
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0049_vehicle_kinds"
down_revision = "0048_vehicles"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("vehicles") as batch:
        batch.add_column(sa.Column("kind", sa.String(12), nullable=False, server_default="car"))
        batch.add_column(sa.Column("meter", sa.String(6), nullable=False, server_default="km"))
        batch.alter_column("registration", existing_type=sa.String(40), server_default="")
        batch.add_column(sa.Column("purchase_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("purchase_price", sa.Numeric(12, 2), nullable=True))
        batch.add_column(sa.Column("charge_price_mode", sa.String(6), nullable=False, server_default="spot"))
        batch.add_column(sa.Column("charge_fixed_price", sa.Float(), nullable=True))
        batch.add_column(sa.Column("charge_extra", sa.Float(), nullable=True))
        batch.add_column(sa.Column("ha_meter_entity", sa.String(200), nullable=True))
    op.add_column("vehicle_expenses", sa.Column("charge_place", sa.String(6), nullable=True))
    op.add_column("documents", sa.Column("vehicle_id", sa.Uuid(), sa.ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_documents_vehicle_id", "documents", ["vehicle_id"])
    op.create_table(
        "vehicle_tyres",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("vehicle_id", sa.Uuid(), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False, server_default=""),
        sa.Column("season", sa.String(8), nullable=False, server_default="summer"),
        sa.Column("size", sa.String(40), nullable=False, server_default=""),
        sa.Column("bought", sa.Date(), nullable=True),
        sa.Column("tread_mm", sa.Float(), nullable=True),
        sa.Column("mounted", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("mounted_at", sa.Date(), nullable=True),
        sa.Column("storage", sa.String(120), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("vehicle_tyres")
    op.drop_index("ix_documents_vehicle_id", "documents")
    op.drop_column("documents", "vehicle_id")
    op.drop_column("vehicle_expenses", "charge_place")
    with op.batch_alter_table("vehicles") as batch:
        for column in ("ha_meter_entity", "charge_extra", "charge_fixed_price", "charge_price_mode", "purchase_price", "purchase_date", "meter", "kind"):
            batch.drop_column(column)
