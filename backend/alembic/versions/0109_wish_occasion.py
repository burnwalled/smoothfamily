"""A wish list for Christmas beside the birthday one: every wish, gift idea and share link says
which occasion it is for. What was there before is for the birthday.

Revision ID: 0109_wish_occasion
Revises: 0108_geo_country
Create Date: 2026-11-20
"""

from alembic import op
import sqlalchemy as sa

revision = "0109_wish_occasion"
down_revision = "0108_geo_country"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wish_items", sa.Column("occasion", sa.String(12), nullable=False, server_default="birthday"))
    op.add_column("wish_shares", sa.Column("occasion", sa.String(12), nullable=False, server_default="birthday"))


def downgrade() -> None:
    op.drop_column("wish_shares", "occasion")
    op.drop_column("wish_items", "occasion")
