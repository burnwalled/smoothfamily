"""More task schedules (3.4.0): every N days, every N months, and a month's first … last weekday
(the first Saturday) – for every task, the pets', the home's and the vehicles' too.

Revision ID: 0080_task_schedules
Revises: 0079_task_deleted_at
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0080_task_schedules"
down_revision = "0079_task_deleted_at"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("interval_days", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("tasks", sa.Column("interval_months", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("tasks", sa.Column("month_nth", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "month_nth")
    op.drop_column("tasks", "interval_months")
    op.drop_column("tasks", "interval_days")
