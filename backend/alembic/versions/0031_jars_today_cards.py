"""Savings jars set up per child; school and waste collection for the Today cards.

Revision ID: 0031_jars_today_cards
Revises: 0030_birthdays_shop
Create Date: 2026-10-27
"""

from alembic import op
import sqlalchemy as sa

revision = "0031_jars_today_cards"
down_revision = "0030_birthdays_shop"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("school", sa.String(120), nullable=True))
    op.add_column("families", sa.Column("waste_ical_url", sa.String(1000), nullable=True))
    op.create_table(
        "savings_jars",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("pct", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target", sa.Numeric(10, 2), nullable=True),
        sa.Column("reached_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("archived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "jar_entries",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("jar_id", sa.Uuid(), sa.ForeignKey("savings_jars.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.add_column("allowance_payouts", sa.Column("jar_id", sa.Uuid(), sa.ForeignKey("savings_jars.id", ondelete="SET NULL"), nullable=True))


def downgrade() -> None:
    op.drop_column("allowance_payouts", "jar_id")
    op.drop_table("jar_entries")
    op.drop_table("savings_jars")
    op.drop_column("families", "waste_ical_url")
    op.drop_column("users", "school")
