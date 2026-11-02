"""Local AI: the job queue and each family's choice.

Revision ID: 0044_local_ai
Revises: 0043_pantry
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0044_local_ai"
down_revision = "0043_pantry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("families", sa.Column("ai_enabled", sa.Boolean(), nullable=True))
    op.create_table(
        "ai_jobs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="queued", index=True),
        sa.Column("input", sa.JSON(), nullable=False),
        sa.Column("file_key", sa.String(300), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("error", sa.String(300), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("ai_jobs")
    op.drop_column("families", "ai_enabled")
