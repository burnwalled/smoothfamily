"""A kitchen display may show the little ones' routines.

Revision ID: 0047_kiosk_easy
Revises: 0046_easy_mode
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0047_kiosk_easy"
down_revision = "0046_easy_mode"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosk_screens", sa.Column("easy_mode", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column("kiosk_screens", "easy_mode")
