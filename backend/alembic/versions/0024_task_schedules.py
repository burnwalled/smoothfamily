"""Task schedules: several weekdays, every N weeks, and monthly tasks.

Revision ID: 0024_task_schedules
Revises: 0023_nav_prefs
Create Date: 2026-10-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0024_task_schedules"
down_revision = "0023_nav_prefs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("weekdays", sa.JSON(), nullable=False, server_default="[]"))
    op.add_column("tasks", sa.Column("interval_weeks", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("tasks", sa.Column("anchor_date", sa.Date(), nullable=True))
    # Existing weekly tasks keep their single weekday as the list.
    tasks = sa.table("tasks", sa.column("id", sa.Uuid()), sa.column("weekday", sa.Integer()), sa.column("weekdays", sa.JSON()))
    conn = op.get_bind()
    for task_id, weekday in conn.execute(sa.select(tasks.c.id, tasks.c.weekday).where(tasks.c.weekday.is_not(None))).all():
        conn.execute(tasks.update().where(tasks.c.id == task_id).values(weekdays=[weekday]))


def downgrade() -> None:
    op.drop_column("tasks", "anchor_date")
    op.drop_column("tasks", "interval_weeks")
    op.drop_column("tasks", "weekdays")
