"""Parties (3.4.0): the invitation page with RSVP for the guests, and the adults' planning – the
checklist with reminders, the budget and the day's timeline – and the thank-you page.

Revision ID: 0088_parties
Revises: 0087_school_sources
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0088_parties"
down_revision = "0087_school_sources"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "parties",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False, server_default="party"),
        sa.Column("person_id", sa.Uuid(), sa.ForeignKey("people.id", ondelete="SET NULL"), nullable=True),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("place", sa.String(200), nullable=False, server_default=""),
        sa.Column("address", sa.String(300), nullable=False, server_default=""),
        sa.Column("theme", sa.String(120), nullable=False, server_default=""),
        sa.Column("emoji", sa.String(16), nullable=False, server_default="🎉"),
        sa.Column("color", sa.String(20), nullable=False, server_default="#E85D75"),
        sa.Column("invitation", sa.Text(), nullable=False, server_default=""),
        sa.Column("rsvp_by", sa.Date(), nullable=True),
        sa.Column("plus_one", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("show_guests", sa.String(10), nullable=False, server_default="count"),
        sa.Column("wishlist", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("budget", sa.Numeric(12, 2), nullable=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("token_encrypted", sa.Text(), nullable=False),
        sa.Column("thanks_text", sa.Text(), nullable=False, server_default=""),
        sa.Column("thanks_album_id", sa.Uuid(), sa.ForeignKey("albums.id", ondelete="SET NULL"), nullable=True),
        sa.Column("thanks_published", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("event_id", sa.Uuid(), sa.ForeignKey("family_events.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "party_guests",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("party_id", sa.Uuid(), sa.ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("first_name", sa.String(80), nullable=False),
        sa.Column("last_name", sa.String(80), nullable=False, server_default=""),
        sa.Column("coming", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("allergies", sa.String(300), nullable=False, server_default=""),
        sa.Column("message", sa.String(500), nullable=False, server_default=""),
        sa.Column("plus_first_name", sa.String(80), nullable=True),
        sa.Column("plus_last_name", sa.String(80), nullable=True),
        sa.Column("plus_allergies", sa.String(300), nullable=False, server_default=""),
        sa.Column("key_hash", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "party_tasks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("party_id", sa.Uuid(), sa.ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("who", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("reminded_on", sa.Date(), nullable=True),
    )
    op.create_table(
        "party_expenses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("party_id", sa.Uuid(), sa.ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("paid_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "party_steps",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("party_id", sa.Uuid(), sa.ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("at", sa.String(5), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
    )


def downgrade() -> None:
    for table in ("party_steps", "party_expenses", "party_tasks", "party_guests", "parties"):
        op.drop_table(table)
