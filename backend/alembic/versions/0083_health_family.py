"""Health together (3.4.0): the family's goals, and a task done by exercising.

Revision ID: 0083_health_family
Revises: 0082_health
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0083_health_family"
down_revision = "0082_health"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tasks", sa.Column("exercise_minutes", sa.Integer(), nullable=True))
    op.create_table(
        "health_goals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("metric", sa.String(10), nullable=False),
        sa.Column("target", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_health_goals_family_id", "health_goals", ["family_id"])


def downgrade() -> None:
    op.drop_table("health_goals")
    op.drop_column("tasks", "exercise_minutes")
