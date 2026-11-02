"""Homes rework: maintenance reminders (that can become tasks), things in the home, meters
(also from Home Assistant), more about the home, project notes and documents.

Revision ID: 0050_property
Revises: 0049_vehicle_kinds
Create Date: 2026-10-29
"""

from alembic import op
import sqlalchemy as sa

revision = "0050_property"
down_revision = "0049_vehicle_kinds"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("properties") as batch:
        batch.add_column(sa.Column("dwelling", sa.String(12), nullable=False, server_default="villa"))
        batch.add_column(sa.Column("built_year", sa.Integer(), nullable=True))
        batch.add_column(sa.Column("area_m2", sa.Float(), nullable=True))
        batch.add_column(sa.Column("purchase_date", sa.Date(), nullable=True))
        batch.add_column(sa.Column("purchase_price", sa.Numeric(14, 2), nullable=True))
    op.add_column("property_projects", sa.Column("notes", sa.Text(), nullable=True))
    op.add_column("documents", sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True))
    op.create_index("ix_documents_property_id", "documents", ["property_id"])
    op.create_table(
        "property_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("room", sa.String(60), nullable=False, server_default=""),
        sa.Column("brand", sa.String(80), nullable=False, server_default=""),
        sa.Column("model", sa.String(120), nullable=False, server_default=""),
        sa.Column("serial", sa.String(80), nullable=False, server_default=""),
        sa.Column("bought", sa.Date(), nullable=True),
        sa.Column("price", sa.Numeric(12, 2), nullable=True),
        sa.Column("warranty_until", sa.Date(), nullable=True),
        sa.Column("manual_url", sa.String(500), nullable=False, server_default=""),
        sa.Column("receipt_media_id", sa.Uuid(), sa.ForeignKey("media_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "property_reminders",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(12), nullable=False, server_default="maintenance"),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False, index=True),
        sa.Column("repeat_months", sa.Integer(), nullable=True),
        sa.Column("remind_days", sa.Integer(), nullable=False, server_default="14"),
        sa.Column("reminded_for", sa.Date(), nullable=True),
        sa.Column("last_done", sa.Date(), nullable=True),
        sa.Column("item_id", sa.Uuid(), sa.ForeignKey("property_items.id", ondelete="SET NULL"), nullable=True),
        sa.Column("assignee_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("task_points", sa.Integer(), nullable=False, server_default="10"),
        sa.Column("task_id", sa.Uuid(), sa.ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_table(
        "property_meters",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False, index=True),
        sa.Column("property_id", sa.Uuid(), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("unit", sa.String(10), nullable=False),
        sa.Column("ha_entity", sa.String(200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )


def downgrade() -> None:
    op.drop_table("property_meters")
    op.drop_table("property_reminders")
    op.drop_table("property_items")
    op.drop_index("ix_documents_property_id", "documents")
    op.drop_column("documents", "property_id")
    op.drop_column("property_projects", "notes")
    with op.batch_alter_table("properties") as batch:
        for column in ("purchase_price", "purchase_date", "area_m2", "built_year", "dwelling"):
            batch.drop_column(column)
