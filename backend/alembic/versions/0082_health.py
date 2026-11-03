"""Health per person (3.4.0): workouts, the day's numbers (steps, sleep, weight, resting pulse) and
who each person shares them with.

Revision ID: 0082_health
Revises: 0081_fox_themes
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0082_health"
down_revision = "0081_fox_themes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("health_share", sa.JSON(), nullable=True))
    op.create_table(
        "workouts",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("minutes", sa.Integer(), nullable=False),
        sa.Column("distance_km", sa.Float(), nullable=True),
        sa.Column("note", sa.String(300), nullable=False, server_default=""),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("external_id", sa.String(120), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "source", "external_id", name="uq_workout_source"),
    )
    op.create_index("ix_workouts_family_id", "workouts", ["family_id"])
    op.create_index("ix_workouts_user_id", "workouts", ["user_id"])
    op.create_index("ix_workouts_day", "workouts", ["day"])
    op.create_table(
        "health_days",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("steps", sa.Integer(), nullable=True),
        sa.Column("sleep_minutes", sa.Integer(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
        sa.Column("resting_hr", sa.Integer(), nullable=True),
        sa.Column("source", sa.String(20), nullable=False, server_default="manual"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "day", name="uq_health_day"),
    )
    op.create_index("ix_health_days_family_id", "health_days", ["family_id"])
    op.create_index("ix_health_days_user_id", "health_days", ["user_id"])


def downgrade() -> None:
    op.drop_table("health_days")
    op.drop_table("workouts")
    op.drop_column("users", "health_share")
