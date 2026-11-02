"""Document vault, emergency cards and guest links.

Revision ID: 0036_documents_emergency_guests
Revises: 0035_waste_schedules
Create Date: 2026-10-28
"""

import json

from alembic import op
import sqlalchemy as sa

revision = "0036_documents_emergency_guests"
down_revision = "0035_waste_schedules"
branch_labels = None
depends_on = None

# Members whose apps the admin chose get the emergency card; documents stay off until turned on.
NEW_APPS = ["emergency"]


def upgrade() -> None:
    op.add_column("families", sa.Column("vault_key_encrypted", sa.Text(), nullable=True))
    op.create_table(
        "documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True),
        sa.Column("kind", sa.String(20), nullable=False, server_default="other"),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("number_encrypted", sa.Text(), nullable=True),
        sa.Column("number_last4", sa.String(8), nullable=True),
        sa.Column("issued_date", sa.Date(), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True, index=True),
        sa.Column("remind_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("reminded_for", sa.Date(), nullable=True),
        sa.Column("private", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "document_files",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("storage_key", sa.String(300), nullable=False),
        sa.Column("filename", sa.String(200), nullable=False),
        sa.Column("content_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "emergency_cards",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True, unique=True),
        sa.Column("allergies", sa.Text(), nullable=False, server_default=""),
        sa.Column("medicines", sa.Text(), nullable=False, server_default=""),
        sa.Column("health_centre", sa.String(300), nullable=False, server_default=""),
        sa.Column("insurance", sa.String(200), nullable=False, server_default=""),
        sa.Column("contacts", sa.JSON(), nullable=False),
        sa.Column("routines", sa.Text(), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("address", sa.String(300), nullable=False, server_default=""),
        sa.Column("updated_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "guest_access",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True, index=True),
        sa.Column("show_calendar", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("list_ids", sa.JSON(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "guest_visits",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("guest_id", sa.Uuid(), sa.ForeignKey("guest_access.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_agent", sa.String(200), nullable=False, server_default=""),
    )

    conn = op.get_bind()
    users = sa.table("users", sa.column("id", sa.Uuid()), sa.column("app_access", sa.JSON()))
    for row in conn.execute(sa.select(users.c.id, users.c.app_access).where(users.c.app_access.is_not(None))):
        apps = row.app_access if isinstance(row.app_access, list) else json.loads(row.app_access)
        conn.execute(users.update().where(users.c.id == row.id).values(app_access=sorted(set(apps) | set(NEW_APPS))))


def downgrade() -> None:
    op.drop_table("guest_visits")
    op.drop_table("guest_access")
    op.drop_table("emergency_cards")
    op.drop_table("document_files")
    op.drop_table("documents")
    op.drop_column("families", "vault_key_encrypted")
