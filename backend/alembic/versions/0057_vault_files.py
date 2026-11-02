"""Any file kept in the vault, encrypted with the family's key.

Revision ID: 0057_vault_files
Revises: 0056_vault_shares
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0057_vault_files"
down_revision = "0056_vault_shares"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "vault_files",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("uploaded_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(150), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("storage_key", sa.String(300), nullable=False),
        sa.Column("private", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("vault_files")
