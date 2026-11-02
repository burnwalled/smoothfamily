"""Phase H: task approvals and allowance settings.

Revision ID: 0009_allowance
Revises: 0008
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0009_allowance"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("families", sa.Column("currency", sa.String(length=8), nullable=False, server_default="kr"))
    op.add_column(
        "families",
        sa.Column("shopping_task_points", sa.Integer(), nullable=False, server_default=sa.text("25")),
    )

    op.add_column("users", sa.Column("allowance_rate", sa.Numeric(8, 2), nullable=True))

    op.add_column(
        "tasks",
        sa.Column("requires_approval", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )

    op.add_column(
        "task_completions",
        sa.Column("status", sa.String(length=10), nullable=False, server_default="approved"),
    )
    op.add_column("task_completions", sa.Column("reviewed_by", sa.Uuid(), nullable=True))
    op.add_column("task_completions", sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("task_completions", sa.Column("review_note", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_task_completions_reviewed_by_users",
        "task_completions",
        "users",
        ["reviewed_by"],
        ["id"],
    )

    op.create_table(
        "allowance_payouts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_allowance_payouts_family_id", "allowance_payouts", ["family_id"])
    op.create_index("ix_allowance_payouts_user_id", "allowance_payouts", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_allowance_payouts_user_id", table_name="allowance_payouts")
    op.drop_index("ix_allowance_payouts_family_id", table_name="allowance_payouts")
    op.drop_table("allowance_payouts")

    op.drop_constraint("fk_task_completions_reviewed_by_users", "task_completions", type_="foreignkey")
    op.drop_column("task_completions", "review_note")
    op.drop_column("task_completions", "reviewed_at")
    op.drop_column("task_completions", "reviewed_by")
    op.drop_column("task_completions", "status")

    op.drop_column("tasks", "requires_approval")

    op.drop_column("users", "allowance_rate")

    op.drop_column("families", "shopping_task_points")
    op.drop_column("families", "currency")
