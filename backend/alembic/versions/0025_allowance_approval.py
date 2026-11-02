"""Children's tasks need approval by default; allowance rate as points per unit of money.

Revision ID: 0025_allowance_approval
Revises: 0024_task_schedules
Create Date: 2026-10-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0025_allowance_approval"
down_revision = "0024_task_schedules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("families", sa.Column("child_approval", sa.Boolean(), nullable=False, server_default=sa.true()))
    # The older money-per-point rate keeps working until an adult sets points per unit.
    op.add_column("users", sa.Column("allowance_points_per_unit", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "allowance_points_per_unit")
    op.drop_column("families", "child_approval")
