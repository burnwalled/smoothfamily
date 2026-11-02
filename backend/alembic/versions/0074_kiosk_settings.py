"""The kitchen display's own settings (3.0.4): whether it dims at night and from when to when, the
language it speaks (None = the family admin's), its colour theme, and the smart home devices it may
control (None = none).

Revision ID: 0074_kiosk_settings
Revises: 0073_kiosk_shared_tasks
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0074_kiosk_settings"
down_revision = "0073_kiosk_shared_tasks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosk_screens", sa.Column("night_dim", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("kiosk_screens", sa.Column("night_from", sa.Integer(), nullable=False, server_default="22"))
    op.add_column("kiosk_screens", sa.Column("night_to", sa.Integer(), nullable=False, server_default="6"))
    op.add_column("kiosk_screens", sa.Column("language", sa.String(5), nullable=True))
    op.add_column("kiosk_screens", sa.Column("theme", sa.String(20), nullable=True))
    op.add_column("kiosk_screens", sa.Column("devices", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("kiosk_screens", "devices")
    op.drop_column("kiosk_screens", "theme")
    op.drop_column("kiosk_screens", "language")
    op.drop_column("kiosk_screens", "night_to")
    op.drop_column("kiosk_screens", "night_from")
    op.drop_column("kiosk_screens", "night_dim")
