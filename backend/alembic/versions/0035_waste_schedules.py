"""Waste collection schedules entered by hand (for municipalities without an iCal calendar).

Revision ID: 0035_waste_schedules
Revises: 0034_week_weather_rides
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0035_waste_schedules"
down_revision = "0034_week_weather_rides"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "waste_schedules",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("anchor_date", sa.Date(), nullable=False),
        sa.Column("interval_weeks", sa.Integer(), nullable=False, server_default="2"),
        sa.Column("months", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("waste_schedules")
