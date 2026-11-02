"""Lunches in the meal plan (3.2.0): a meal is the day's dinner, a lunchbox to take along (the
leftovers of the dinner the evening before, cooked in a bigger batch) or the weekend's lunch – and
the family's choice of which to plan, remembered for next week.

Revision ID: 0077_meal_slots
Revises: 0076_devices
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0077_meal_slots"
down_revision = "0076_devices"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meals", sa.Column("slot", sa.String(10), nullable=False, server_default="dinner"))
    op.add_column("families", sa.Column("meal_lunchboxes", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("families", sa.Column("meal_weekend_lunch", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("families", "meal_weekend_lunch")
    op.drop_column("families", "meal_lunchboxes")
    op.drop_column("meals", "slot")
