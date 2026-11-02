"""A calendar feed can be a member's own calendar.

Revision ID: 0062_feed_member
Revises: 0061_jar_requests
Create Date: 2026-10-31
"""

from alembic import op
import sqlalchemy as sa

revision = "0062_feed_member"
down_revision = "0061_jar_requests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("calendar_feeds", sa.Column("member_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True))


def downgrade() -> None:
    op.drop_column("calendar_feeds", "member_id")
