"""The other parent's own account, and their messages with the family's adults.

Revision ID: 0060_coparents
Revises: 0059_family_quota
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0060_coparents"
down_revision = "0059_family_quota"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "coparents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("child_ids", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("username", sa.String(120), nullable=True, unique=True),
        sa.Column("password_hash", sa.String(200), nullable=True),
        sa.Column("invite_token_hash", sa.String(64), nullable=True, unique=True),
        sa.Column("invite_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("joined_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "coparent_messages",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("coparent_id", sa.Uuid(), sa.ForeignKey("coparents.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("sender_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, index=True),
    )


def downgrade() -> None:
    op.drop_table("coparent_messages")
    op.drop_table("coparents")
