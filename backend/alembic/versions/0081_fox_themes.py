"""The fox dresses up (3.4.0): a screen can turn off the fox screensaver's holiday and birthday themes.

Revision ID: 0081_fox_themes
Revises: 0080_task_schedules
Create Date: 2026-11-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0081_fox_themes"
down_revision = "0080_task_schedules"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("kiosk_screens", sa.Column("fox_themes", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column("kiosk_screens", "fox_themes")
