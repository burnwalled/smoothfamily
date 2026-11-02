"""The kitchen display's screensaver (theme and when), tasks several can do together, and each one's
share of the points.

Revision ID: 0073_kiosk_shared_tasks
Revises: 0072_gateway_updates
Create Date: 2026-11-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0073_kiosk_shared_tasks"
down_revision = "0072_gateway_updates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosk_screens", sa.Column("screensaver", sa.String(12), nullable=False, server_default="photos"))
    op.add_column("kiosk_screens", sa.Column("idle_minutes", sa.Integer(), nullable=False, server_default="5"))
    op.add_column("tasks", sa.Column("shared", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("task_completions", sa.Column("share", sa.Integer(), nullable=True))
    # Done together: one completion per person (it was one per task and day).
    op.drop_constraint("uq_completion_task_date", "task_completions", type_="unique")
    op.create_unique_constraint("uq_completion_task_date_user", "task_completions", ["task_id", "completed_date", "user_id"])


def downgrade() -> None:
    op.drop_constraint("uq_completion_task_date_user", "task_completions", type_="unique")
    op.create_unique_constraint("uq_completion_task_date", "task_completions", ["task_id", "completed_date"])
    op.drop_column("task_completions", "share")
    op.drop_column("tasks", "shared")
    op.drop_column("kiosk_screens", "idle_minutes")
    op.drop_column("kiosk_screens", "screensaver")
