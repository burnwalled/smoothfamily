"""Presence via Home Assistant: the person entity per member and what they share.

Revision ID: 0037_presence
Revises: 0036_documents_emergency_guests
Create Date: 2026-10-28
"""

from alembic import op
import sqlalchemy as sa

revision = "0037_presence"
down_revision = "0036_documents_emergency_guests"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("ha_person_entity", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("ha_travel_entity", sa.String(200), nullable=True))
    op.add_column("users", sa.Column("presence_share", sa.String(10), nullable=False, server_default="off"))


def downgrade() -> None:
    for column in ("presence_share", "ha_travel_entity", "ha_person_entity"):
        op.drop_column("users", column)
