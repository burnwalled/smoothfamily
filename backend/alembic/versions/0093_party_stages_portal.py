"""Parties (3.4.0): a save-the-date and a thank-you poster beside the invitation's, a playlist, and
the party day's portal where the guests upload their photos; sign-ups from the save-the-date.

Revision ID: 0093_party_stages_portal
Revises: 0092_party_layout
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0093_party_stages_portal"
down_revision = "0092_party_layout"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for col in ("save_layout", "portal_layout", "thanks_layout"):
        op.add_column("parties", sa.Column(col, sa.JSON(), nullable=True))
    op.add_column("parties", sa.Column("phase", sa.String(10), nullable=False, server_default="invite"))
    op.add_column("parties", sa.Column("playlist_url", sa.String(300), nullable=True))
    op.add_column("parties", sa.Column("portal_token_hash", sa.String(64), nullable=True, unique=True))
    op.add_column("parties", sa.Column("portal_token_encrypted", sa.Text(), nullable=True))
    op.add_column("parties", sa.Column("portal_album_id", sa.Uuid(), sa.ForeignKey("albums.id", ondelete="SET NULL"), nullable=True))
    op.add_column("parties", sa.Column("portal_open", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("parties", sa.Column("portal_gallery", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("party_guests", sa.Column("pending", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("party_guests", "pending")
    for col in ("portal_gallery", "portal_open", "portal_album_id", "portal_token_encrypted", "portal_token_hash", "playlist_url", "phase", "thanks_layout", "portal_layout", "save_layout"):
        op.drop_column("parties", col)
