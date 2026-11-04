"""Rides (3.4.0): someone outside the family can take the drop-off or the pick-up – free text.

Revision ID: 0086_ride_text
Revises: 0085_health_import
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0086_ride_text"
down_revision = "0085_health_import"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("event_plans", sa.Column("drop_off_text", sa.String(80), nullable=True))
    op.add_column("event_plans", sa.Column("pick_up_text", sa.String(80), nullable=True))


def downgrade() -> None:
    op.drop_column("event_plans", "pick_up_text")
    op.drop_column("event_plans", "drop_off_text")
