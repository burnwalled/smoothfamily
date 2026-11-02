"""Birthdays and wish lists, and the reward shop.

Revision ID: 0030_birthdays_shop
Revises: 0029_notifications
Create Date: 2026-10-27
"""

import json

from alembic import op
import sqlalchemy as sa

revision = "0030_birthdays_shop"
down_revision = "0029_notifications"
branch_labels = None
depends_on = None

NEW_APPS = ["birthdays", "shop"]


def upgrade() -> None:
    op.create_table(
        "people",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("birth_month", sa.Integer(), nullable=True),
        sa.Column("birth_day", sa.Integer(), nullable=True),
        sa.Column("birth_year", sa.Integer(), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "wish_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("person_id", sa.Uuid(), sa.ForeignKey("people.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(10), nullable=False, server_default="wish"),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("url", sa.String(1000), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("reserved_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "shop_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("limit_count", sa.Integer(), nullable=True),
        sa.Column("limit_period", sa.String(10), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "shop_purchases",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("shop_items.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("price", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    # Members whose apps the admin has chosen get the new apps too; the admin can turn them off.
    conn = op.get_bind()
    users = sa.table("users", sa.column("id", sa.Uuid()), sa.column("app_access", sa.JSON()))
    for row in conn.execute(sa.select(users.c.id, users.c.app_access).where(users.c.app_access.is_not(None))):
        apps = row.app_access if isinstance(row.app_access, list) else json.loads(row.app_access)
        merged = sorted(set(apps) | set(NEW_APPS))
        conn.execute(users.update().where(users.c.id == row.id).values(app_access=merged))


def downgrade() -> None:
    op.drop_table("shop_purchases")
    op.drop_table("shop_items")
    op.drop_table("wish_items")
    op.drop_table("people")
