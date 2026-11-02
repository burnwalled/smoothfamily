"""A task taken away keeps its history (3.4.0): it is marked deleted instead of being removed, so the
points, the allowance and the history of the times it was done stay as they were.

Revision ID: 0079_task_deleted_at
Revises: 0078_holidays
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0079_task_deleted_at"
down_revision = "0078_holidays"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("tasks", "deleted_at")
