"""The setup guides: when a family's guide was finished or skipped. Servers and families that exist
already are set up – they don't get the guides by themselves (they can open them from the settings).

Revision ID: 0070_setup_guides
Revises: 0069_backup_keys
Create Date: 2026-11-01
"""

from alembic import op
import sqlalchemy as sa

revision = "0070_setup_guides"
down_revision = "0069_backup_keys"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("families", sa.Column("guide_done_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("UPDATE families SET guide_done_at = CURRENT_TIMESTAMP")
    op.execute(
        "INSERT INTO app_settings (key, value) SELECT 'guide_server_done', 'before 2.9.0' "
        "WHERE EXISTS (SELECT 1 FROM families WHERE kind <> 'demo')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM app_settings WHERE key = 'guide_server_done'")
    op.drop_column("families", "guide_done_at")
