"""Family events can be tagged with the members they concern (empty = everyone).

Revision ID: 0022_event_members
Revises: 0021_feedback_reports
Create Date: 2026-10-25
"""

from alembic import op
import sqlalchemy as sa

revision = "0022_event_members"
down_revision = "0021_feedback_reports"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("family_events", sa.Column("member_ids", sa.JSON(), nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("family_events", "member_ids")
