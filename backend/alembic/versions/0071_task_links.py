"""Tasks made from other apps: a medicine's doses (with the points they're worth), the last day a task
is due, and packing before a trip or a calendar event. Existing medicines get their tasks from the
medicine worker on its next round.

Revision ID: 0071_task_links
Revises: 0070_setup_guides
Create Date: 2026-11-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0071_task_links"
down_revision = "0070_setup_guides"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("medication_id", sa.Uuid(), sa.ForeignKey("medications.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_tasks_medication_id", "tasks", ["medication_id"])
    op.add_column("tasks", sa.Column("dose_time", sa.String(5), nullable=True))
    op.add_column("tasks", sa.Column("until_date", sa.Date(), nullable=True))
    op.add_column("tasks", sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_tasks_trip_id", "tasks", ["trip_id"])
    op.add_column("tasks", sa.Column("event_key", sa.String(400), nullable=True))
    op.add_column("medications", sa.Column("points", sa.Integer(), nullable=False, server_default="5"))


def downgrade() -> None:
    op.drop_column("medications", "points")
    op.drop_column("tasks", "event_key")
    op.drop_index("ix_tasks_trip_id", "tasks")
    op.drop_column("tasks", "trip_id")
    op.drop_column("tasks", "until_date")
    op.drop_column("tasks", "dose_time")
    op.drop_index("ix_tasks_medication_id", "tasks")
    op.drop_column("tasks", "medication_id")
