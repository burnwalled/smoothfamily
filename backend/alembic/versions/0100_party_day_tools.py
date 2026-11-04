"""Parties (3.4.0): the check-in, speeches and the menu, practical information, the mails' wording,
helpers from outside with their plan of the evening, and suppliers.

Revision ID: 0100_party_day_tools
Revises: 0099_party_pages_tables
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0100_party_day_tools"
down_revision = "0099_party_pages_tables"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("parties", sa.Column("checkin_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("parties", sa.Column("checkin_layout", sa.JSON(), nullable=True))
    op.add_column("parties", sa.Column("menu", sa.JSON(), nullable=True))
    op.add_column("parties", sa.Column("speech_signup", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("parties", sa.Column("practical", sa.JSON(), nullable=True))
    op.add_column("parties", sa.Column("mail_texts", sa.JSON(), nullable=True))
    op.add_column("parties", sa.Column("plan_hidden", sa.JSON(), nullable=True))
    op.add_column("party_guests", sa.Column("wants_speech", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("party_guests", sa.Column("speech_note", sa.String(200), nullable=False, server_default=""))
    op.add_column("party_guests", sa.Column("menu_choice", sa.String(20), nullable=True))
    op.add_column("party_guests", sa.Column("checkin", sa.String(3), nullable=True))
    op.add_column("party_guests", sa.Column("checkin_on", sa.DateTime(timezone=True), nullable=True))
    op.create_table(
        "party_helpers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("party_id", sa.Uuid(), sa.ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("role", sa.String(12), nullable=False),
        sa.Column("email", sa.String(254), nullable=True),
        sa.Column("days_after", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, index=True),
        sa.Column("token_encrypted", sa.Text(), nullable=False),
        sa.Column("last_seen", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.add_column("party_tasks", sa.Column("helper_id", sa.Uuid(), sa.ForeignKey("party_helpers.id", ondelete="SET NULL"), nullable=True))
    op.create_table(
        "party_plan_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("party_id", sa.Uuid(), sa.ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("at", sa.String(5), nullable=False, server_default=""),
        sa.Column("minutes", sa.Integer(), nullable=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("who", sa.String(120), nullable=False, server_default=""),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("done", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "party_vendors",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("party_id", sa.Uuid(), sa.ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("category", sa.String(12), nullable=False),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("url", sa.String(500), nullable=False, server_default=""),
        sa.Column("contact", sa.String(200), nullable=False, server_default=""),
        sa.Column("price", sa.Numeric(12, 2), nullable=True),
        sa.Column("status", sa.String(6), nullable=False),
        sa.Column("note", sa.Text(), nullable=False, server_default=""),
        sa.Column("expense_id", sa.Uuid(), sa.ForeignKey("party_expenses.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("party_vendors")
    op.drop_table("party_plan_items")
    op.drop_column("party_tasks", "helper_id")
    op.drop_table("party_helpers")
    for col in ("checkin_on", "checkin", "menu_choice", "speech_note", "wants_speech"):
        op.drop_column("party_guests", col)
    for col in ("plan_hidden", "mail_texts", "practical", "speech_signup", "menu", "checkin_layout", "checkin_at"):
        op.drop_column("parties", col)
