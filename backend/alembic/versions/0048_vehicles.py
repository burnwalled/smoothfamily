"""Vehicles rework: reminders, the odometer over time, fuel and charging amounts.

Revision ID: 0048_vehicles
Revises: 0047_kiosk_easy
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0048_vehicles"
down_revision = "0047_kiosk_easy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vehicles", sa.Column("fuel", sa.String(10), nullable=True))
    op.add_column("vehicle_expenses", sa.Column("volume", sa.Float(), nullable=True))
    op.add_column("vehicle_expenses", sa.Column("volume_unit", sa.String(5), nullable=True))
    op.create_table(
        "vehicle_reminders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("vehicle_id", sa.Uuid(), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("title", sa.String(120), nullable=False, server_default=""),
        sa.Column("due_date", sa.Date(), nullable=True, index=True),
        sa.Column("due_mileage", sa.Integer(), nullable=True),
        sa.Column("repeat_months", sa.Integer(), nullable=True),
        sa.Column("repeat_km", sa.Integer(), nullable=True),
        sa.Column("remind_days", sa.Integer(), nullable=False, server_default="14"),
        sa.Column("reminded_for", sa.Date(), nullable=True),
        sa.Column("reminded_km", sa.Integer(), nullable=True),
        sa.Column("last_done", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "vehicle_mileage",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("vehicle_id", sa.Uuid(), sa.ForeignKey("vehicles.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("reading_date", sa.Date(), nullable=False),
        sa.Column("mileage", sa.Integer(), nullable=False),
        sa.Column("expense_id", sa.Uuid(), sa.ForeignKey("vehicle_expenses.id", ondelete="CASCADE"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    # The odometer readings already on expenses become the start of the log.
    op.execute(
        """
        INSERT INTO vehicle_mileage (id, family_id, vehicle_id, reading_date, mileage, expense_id, created_at)
        SELECT id, family_id, vehicle_id, expense_date, mileage_at, id, created_at
        FROM vehicle_expenses WHERE mileage_at IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_table("vehicle_mileage")
    op.drop_table("vehicle_reminders")
    op.drop_column("vehicle_expenses", "volume_unit")
    op.drop_column("vehicle_expenses", "volume")
    op.drop_column("vehicles", "fuel")
