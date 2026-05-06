"""add family_invites table

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "family_invites",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("family_id", UUID(as_uuid=True), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("invited_email", sa.String(length=320), nullable=False),
        sa.Column("role", sa.String(length=20), nullable=False, server_default="parent"),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("token_hash", name="uq_family_invites_token_hash"),
    )
    op.create_index("ix_family_invites_family_id", "family_invites", ["family_id"])
    op.create_index("ix_family_invites_invited_email", "family_invites", ["invited_email"])
    op.create_index("ix_family_invites_token_hash", "family_invites", ["token_hash"])
    op.create_index("ix_family_invites_expires_at", "family_invites", ["expires_at"])


def downgrade() -> None:
    op.drop_index("ix_family_invites_expires_at", table_name="family_invites")
    op.drop_index("ix_family_invites_token_hash", table_name="family_invites")
    op.drop_index("ix_family_invites_invited_email", table_name="family_invites")
    op.drop_index("ix_family_invites_family_id", table_name="family_invites")
    op.drop_table("family_invites")
