"""The little ones' mode: picture routines and stickers.

Revision ID: 0046_easy_mode
Revises: 0045_pantry_barcodes
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0046_easy_mode"
down_revision = "0045_pantry_barcodes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("easy_mode", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("tasks", sa.Column("picture", sa.String(16), nullable=True))
    op.create_table(
        "routines",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("task_id", sa.Uuid(), sa.ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("picture", sa.String(16), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "routine_steps",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("routine_id", sa.Uuid(), sa.ForeignKey("routines.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("picture", sa.String(16), nullable=False),
        sa.Column("label", sa.String(80), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "routine_step_done",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("step_id", sa.Uuid(), sa.ForeignKey("routine_steps.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("day", sa.Date(), nullable=False, index=True),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("step_id", "day", name="uq_routine_step_day"),
    )
    op.create_table(
        "stickers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("sticker", sa.String(16), nullable=False),
        sa.Column("task_id", sa.Uuid(), sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("stickers")
    op.drop_table("routine_step_done")
    op.drop_table("routine_steps")
    op.drop_table("routines")
    op.drop_column("tasks", "picture")
    op.drop_column("users", "easy_mode")
