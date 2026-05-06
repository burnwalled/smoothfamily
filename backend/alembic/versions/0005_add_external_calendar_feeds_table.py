"""add external calendar feeds table

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "external_calendar_feeds",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("family_id", UUID(as_uuid=True), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("member_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider", sa.String(length=20), nullable=False, server_default="other"),
        sa.Column("display_name", sa.String(length=120), nullable=False),
        sa.Column("ical_url_encrypted", sa.Text(), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "last_fetch_status", sa.String(length=20), nullable=False, server_default="never"
        ),
        sa.Column("last_error_message", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
    )
    op.create_index(
        "ix_external_calendar_feeds_family_id", "external_calendar_feeds", ["family_id"]
    )
    op.create_index(
        "ix_external_calendar_feeds_member_user_id",
        "external_calendar_feeds",
        ["member_user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_external_calendar_feeds_member_user_id", table_name="external_calendar_feeds")
    op.drop_index("ix_external_calendar_feeds_family_id", table_name="external_calendar_feeds")
    op.drop_table("external_calendar_feeds")
