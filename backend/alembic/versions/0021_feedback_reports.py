"""Bug reports and wishes sent from the app to GitHub issues.

Revision ID: 0021_feedback_reports
Revises: 0020_family_events
Create Date: 2026-10-25
"""

from alembic import op
import sqlalchemy as sa

revision = "0021_feedback_reports"
down_revision = "0020_family_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "feedback_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("type", sa.String(10), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("has_screenshot", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("issue_number", sa.Integer(), nullable=False),
        sa.Column("issue_url", sa.String(300), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_feedback_reports_family_id", "feedback_reports", ["family_id"])
    op.create_index("ix_feedback_reports_user_id", "feedback_reports", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_feedback_reports_user_id", table_name="feedback_reports")
    op.drop_index("ix_feedback_reports_family_id", table_name="feedback_reports")
    op.drop_table("feedback_reports")
