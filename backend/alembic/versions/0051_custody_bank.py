"""Two homes (custody schedules, the other parent's link) and importing the bank's CSV.

Revision ID: 0051_custody_bank
Revises: 0050_property
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0051_custody_bank"
down_revision = "0050_property"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("guest_access", sa.Column("child_ids", sa.JSON(), nullable=False, server_default="[]"))
    op.create_table(
        "custody_schedules",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("other_home", sa.String(60), nullable=False),
        sa.Column("pattern", sa.String(10), nullable=False, server_default="week"),
        sa.Column("anchor_date", sa.Date(), nullable=False),
        sa.Column("handover_time", sa.String(5), nullable=False, server_default="17:00"),
        sa.Column("pause_tasks", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("handover_list_id", sa.Uuid(), sa.ForeignKey("lists.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reminded_for", sa.Date(), nullable=True),
        sa.Column("cleared_for", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "custody_exceptions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("schedule_id", sa.Uuid(), sa.ForeignKey("custody_schedules.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("place", sa.String(5), nullable=False),
        sa.Column("note", sa.String(120), nullable=False, server_default=""),
    )
    op.create_table(
        "bank_rules",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("pattern", sa.String(80), nullable=False),
        sa.Column("target", sa.String(10), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=True),
        sa.Column("category", sa.String(20), nullable=False, server_default="other"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "bank_imported",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("digest", sa.String(64), nullable=False),
        sa.Column("imported_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("family_id", "digest", name="uq_bank_imported"),
    )


def downgrade() -> None:
    op.drop_table("bank_imported")
    op.drop_table("bank_rules")
    op.drop_table("custody_exceptions")
    op.drop_table("custody_schedules")
    op.drop_column("guest_access", "child_ids")
