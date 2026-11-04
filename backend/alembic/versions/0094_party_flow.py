"""Parties (3.4.0): the hosts' own guest list with e-mail, mails sent at their time, and the
day's plan with points hidden from the guests.

Revision ID: 0094_party_flow
Revises: 0093_party_stages_portal
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0094_party_flow"
down_revision = "0093_party_stages_portal"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("party_steps", sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("party_guests", sa.Column("key_encrypted", sa.Text(), nullable=True))
    op.create_table(
        "party_mailings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("party_id", sa.Uuid(), sa.ForeignKey("parties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(10), nullable=False),
        sa.Column("audience", sa.String(10), nullable=False),
        sa.Column("subject", sa.String(120), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("send_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_count", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("party_mailings")
    op.drop_column("party_guests", "key_encrypted")
    op.drop_column("party_steps", "hidden")
