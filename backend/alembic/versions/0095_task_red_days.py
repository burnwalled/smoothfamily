"""Tasks (3.4.0): every workday or every weekend day and red day – the family's country for them.

Revision ID: 0095_task_red_days
Revises: 0094_party_flow
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0095_task_red_days"
down_revision = "0094_party_flow"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("holiday_country", sa.String(6), nullable=True))
    # The family's country onto its tasks, as it is now.
    op.execute("UPDATE tasks SET holiday_country = (SELECT holiday_country FROM families WHERE families.id = tasks.family_id)")


def downgrade() -> None:
    op.drop_column("tasks", "holiday_country")
