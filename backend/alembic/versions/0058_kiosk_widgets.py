"""Each kitchen display chooses what it shows.

Revision ID: 0058_kiosk_widgets
Revises: 0057_vault_files
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0058_kiosk_widgets"
down_revision = "0057_vault_files"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosk_screens", sa.Column("widgets", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosk_screens", "widgets")
