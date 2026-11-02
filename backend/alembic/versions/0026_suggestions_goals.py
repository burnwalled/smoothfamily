"""Task suggestions from children, point goals for the allowance, and family rewards.

Revision ID: 0026_suggestions_goals
Revises: 0025_allowance_approval
Create Date: 2026-10-26
"""

from alembic import op
import sqlalchemy as sa

revision = "0026_suggestions_goals"
down_revision = "0025_allowance_approval"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "task_suggestions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("task_id", sa.Uuid(), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["task_id"], ["tasks.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_task_suggestions_family_id", "task_suggestions", ["family_id"])
    op.create_index("ix_task_suggestions_user_id", "task_suggestions", ["user_id"])

    op.create_table(
        "family_rewards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("points_required", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("unlocked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("redeemed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_family_rewards_family_id", "family_rewards", ["family_id"])

    op.add_column("users", sa.Column("allowance_mode", sa.String(10), nullable=False, server_default="points"))
    op.add_column("users", sa.Column("allowance_period", sa.String(10), nullable=False, server_default="week"))
    op.add_column("users", sa.Column("allowance_min_points", sa.Integer(), nullable=True))
    op.add_column("users", sa.Column("allowance_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("users", sa.Column("allowance_min_points_since", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "allowance_min_points_since")
    op.drop_column("users", "allowance_amount")
    op.drop_column("users", "allowance_min_points")
    op.drop_column("users", "allowance_period")
    op.drop_column("users", "allowance_mode")
    op.drop_index("ix_family_rewards_family_id", table_name="family_rewards")
    op.drop_table("family_rewards")
    op.drop_index("ix_task_suggestions_user_id", table_name="task_suggestions")
    op.drop_index("ix_task_suggestions_family_id", table_name="task_suggestions")
    op.drop_table("task_suggestions")
