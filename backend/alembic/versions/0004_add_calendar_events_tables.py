"""add calendar event tables

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-06
"""

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID

from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "calendar_events",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("family_id", UUID(as_uuid=True), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("creator_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location", sa.String(length=200), nullable=True),
        sa.Column("start_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("end_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.text("false")),
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
    op.create_index("ix_calendar_events_family_id", "calendar_events", ["family_id"])
    op.create_index("ix_calendar_events_creator_user_id", "calendar_events", ["creator_user_id"])
    op.create_index("ix_calendar_events_start_at", "calendar_events", ["start_at"])
    op.create_index("ix_calendar_events_end_at", "calendar_events", ["end_at"])

    op.create_table(
        "calendar_event_members",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column("event_id", UUID(as_uuid=True), sa.ForeignKey("calendar_events.id"), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.UniqueConstraint("event_id", "user_id", name="uq_calendar_event_member"),
    )
    op.create_index("ix_calendar_event_members_event_id", "calendar_event_members", ["event_id"])
    op.create_index("ix_calendar_event_members_user_id", "calendar_event_members", ["user_id"])

    op.create_table(
        "calendar_event_hidden_members",
        sa.Column(
            "id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")
        ),
        sa.Column(
            "event_id", UUID(as_uuid=True), sa.ForeignKey("calendar_events.id"), nullable=False
        ),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.UniqueConstraint("event_id", "user_id", name="uq_calendar_event_hidden_member"),
    )
    op.create_index(
        "ix_calendar_event_hidden_members_event_id",
        "calendar_event_hidden_members",
        ["event_id"],
    )
    op.create_index(
        "ix_calendar_event_hidden_members_user_id",
        "calendar_event_hidden_members",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_calendar_event_hidden_members_user_id", table_name="calendar_event_hidden_members")
    op.drop_index("ix_calendar_event_hidden_members_event_id", table_name="calendar_event_hidden_members")
    op.drop_table("calendar_event_hidden_members")

    op.drop_index("ix_calendar_event_members_user_id", table_name="calendar_event_members")
    op.drop_index("ix_calendar_event_members_event_id", table_name="calendar_event_members")
    op.drop_table("calendar_event_members")

    op.drop_index("ix_calendar_events_end_at", table_name="calendar_events")
    op.drop_index("ix_calendar_events_start_at", table_name="calendar_events")
    op.drop_index("ix_calendar_events_creator_user_id", table_name="calendar_events")
    op.drop_index("ix_calendar_events_family_id", table_name="calendar_events")
    op.drop_table("calendar_events")
