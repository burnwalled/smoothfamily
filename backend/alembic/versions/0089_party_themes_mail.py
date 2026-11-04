"""Parties (3.4.0): a theme for the guests' page and the thank-you, and updates by e-mail for the
guests who ask for them.

Revision ID: 0089_party_themes_mail
Revises: 0088_parties
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0089_party_themes_mail"
down_revision = "0088_parties"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("parties", sa.Column("page_theme", sa.String(20), nullable=False, server_default="balloons"))
    op.add_column("parties", sa.Column("thanks_theme", sa.String(20), nullable=False, server_default=""))
    op.add_column("parties", sa.Column("guests_reminded_on", sa.Date(), nullable=True))
    op.add_column("party_guests", sa.Column("email", sa.String(254), nullable=True))
    op.add_column("party_guests", sa.Column("updates", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("party_guests", sa.Column("unsubscribe_hash", sa.String(64), nullable=True))


def downgrade() -> None:
    for col in ("unsubscribe_hash", "updates", "email"):
        op.drop_column("party_guests", col)
    for col in ("guests_reminded_on", "thanks_theme", "page_theme"):
        op.drop_column("parties", col)
