"""Trips and holidays.

Revision ID: 0042_trips
Revises: 0041_memories
Create Date: 2026-10-28
"""

import json

from alembic import op
import sqlalchemy as sa

revision = "0042_trips"
down_revision = "0041_memories"
branch_labels = None
depends_on = None

NEW_APPS = ["trips"]


def upgrade() -> None:
    op.create_table(
        "trips",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("destination", sa.String(200), nullable=False, server_default=""),
        sa.Column("start_date", sa.Date(), nullable=False, index=True),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("member_ids", sa.JSON(), nullable=False),
        sa.Column("budget", sa.Numeric(10, 2), nullable=True),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("reminded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "trip_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(10), nullable=False, server_default="activity"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("starts_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ends_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("place", sa.String(300), nullable=False, server_default=""),
        sa.Column("notes", sa.Text(), nullable=False, server_default=""),
        sa.Column("document_id", sa.Uuid(), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "trip_packing",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=True),
        sa.Column("text", sa.String(120), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "trip_expenses",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("paid_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "trip_checks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("trip_id", sa.Uuid(), sa.ForeignKey("trips.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("text", sa.String(120), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("position", sa.Integer(), nullable=False, server_default="0"),
    )

    conn = op.get_bind()
    users = sa.table("users", sa.column("id", sa.Uuid()), sa.column("app_access", sa.JSON()))
    for row in conn.execute(sa.select(users.c.id, users.c.app_access).where(users.c.app_access.is_not(None))):
        apps = row.app_access if isinstance(row.app_access, list) else json.loads(row.app_access)
        conn.execute(users.update().where(users.c.id == row.id).values(app_access=sorted(set(apps) | set(NEW_APPS))))


def downgrade() -> None:
    for table in ("trip_checks", "trip_expenses", "trip_packing", "trip_items", "trips"):
        op.drop_table(table)
