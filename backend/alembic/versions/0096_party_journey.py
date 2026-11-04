"""Parties (3.4.0): the guests' one link through the party – when it becomes the portal, when the
thank-you goes out, and the automatic reminder to those who haven't replied.

Revision ID: 0096_party_journey
Revises: 0095_task_red_days
Create Date: 2026-11-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0096_party_journey"
down_revision = "0095_task_red_days"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("parties", sa.Column("portal_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("parties", sa.Column("thanks_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("parties", sa.Column("rsvp_remind_days", sa.Integer(), nullable=True, server_default="3"))
    op.add_column("parties", sa.Column("rsvp_reminded_on", sa.Date(), nullable=True))


def downgrade() -> None:
    for col in ("rsvp_reminded_on", "rsvp_remind_days", "thanks_at", "portal_at"):
        op.drop_column("parties", col)
