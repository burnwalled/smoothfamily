"""Söndagskollen, weather and the morning summary, who drives and packing lists.

Revision ID: 0034_week_weather_rides
Revises: 0033_rotation_medicine_pets
Create Date: 2026-10-28
"""

import json

from alembic import op
import sqlalchemy as sa

revision = "0034_week_weather_rides"
down_revision = "0033_rotation_medicine_pets"
branch_labels = None
depends_on = None

NEW_APPS = ["week"]


def upgrade() -> None:
    op.add_column("families", sa.Column("weather_lat", sa.Float(), nullable=True))
    op.add_column("families", sa.Column("weather_lon", sa.Float(), nullable=True))
    op.add_column("families", sa.Column("weather_place", sa.String(120), nullable=True))
    op.add_column("families", sa.Column("week_review_reminder", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("users", sa.Column("morning_summary", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("users", sa.Column("morning_time", sa.String(5), nullable=False, server_default="07:00"))
    op.add_column("users", sa.Column("morning_days", sa.String(10), nullable=False, server_default="weekdays"))
    op.create_table(
        "event_plans",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("key", sa.String(400), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("start", sa.DateTime(timezone=True), nullable=False, index=True),
        sa.Column("needs_ride", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("drop_off_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("pick_up_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("checked", sa.JSON(), nullable=False),
        sa.Column("ride_alerted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("family_id", "key", name="uq_event_plan_key"),
    )
    op.create_table(
        "packing_lists",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("title_key", sa.String(200), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("family_id", "title_key", name="uq_packing_title"),
    )
    op.create_table(
        "week_reviews",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("activity", sa.String(200), nullable=True),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("done_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("family_id", "week_start", name="uq_week_review"),
    )
    op.create_table(
        "thanks_stars",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("week_start", sa.Date(), nullable=False, index=True),
        sa.Column("from_user", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("to_user", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("message", sa.String(200), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    # Members whose apps the admin has chosen get the new app too; the admin can turn it off.
    conn = op.get_bind()
    users = sa.table("users", sa.column("id", sa.Uuid()), sa.column("app_access", sa.JSON()))
    for row in conn.execute(sa.select(users.c.id, users.c.app_access).where(users.c.app_access.is_not(None))):
        apps = row.app_access if isinstance(row.app_access, list) else json.loads(row.app_access)
        conn.execute(users.update().where(users.c.id == row.id).values(app_access=sorted(set(apps) | set(NEW_APPS))))


def downgrade() -> None:
    op.drop_table("thanks_stars")
    op.drop_table("week_reviews")
    op.drop_table("packing_lists")
    op.drop_table("event_plans")
    for column in ("morning_days", "morning_time", "morning_summary"):
        op.drop_column("users", column)
    for column in ("week_review_reminder", "weather_place", "weather_lon", "weather_lat"):
        op.drop_column("families", column)
