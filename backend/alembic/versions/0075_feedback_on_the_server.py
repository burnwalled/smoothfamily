"""Reports of problems and wishes stay on the server (3.1.0): the server admin reads them, sets their
status and exports the chosen ones to the project's public repository by hand. No GitHub token is
kept any more – the old one is removed.

Revision ID: 0075_feedback_on_the_server
Revises: 0074_kiosk_settings
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0075_feedback_on_the_server"
down_revision = "0074_kiosk_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("feedback_reports") as batch:
        batch.alter_column("issue_url", existing_type=sa.String(300), nullable=True)
        batch.add_column(sa.Column("status", sa.String(12), nullable=False, server_default="new"))
        batch.add_column(sa.Column("screenshot_key", sa.String(300), nullable=True))
        batch.add_column(sa.Column("page", sa.String(300), nullable=True))
        batch.add_column(sa.Column("user_agent", sa.String(400), nullable=True))
        batch.add_column(sa.Column("viewport", sa.String(40), nullable=True))
        batch.add_column(sa.Column("admin_note", sa.Text(), nullable=True))
        batch.add_column(sa.Column("exported_at", sa.DateTime(timezone=True), nullable=True))
        batch.add_column(sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))
    # The reports made before were GitHub issues already.
    op.execute("UPDATE feedback_reports SET exported_at = created_at WHERE issue_url IS NOT NULL")
    op.execute("DELETE FROM app_settings WHERE key IN ('github_feedback_repo', 'github_feedback_token')")


def downgrade() -> None:
    with op.batch_alter_table("feedback_reports") as batch:
        for column in ("updated_at", "exported_at", "admin_note", "viewport", "user_agent", "page", "screenshot_key", "status"):
            batch.drop_column(column)
