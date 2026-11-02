"""Phase N+O: property/vehicle docs and yearly task recurrence.

Revision ID: 0014_property_vehicle
Revises: 0013_push_notifications
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa


revision = "0014_property_vehicle"
down_revision = "0013_push_notifications"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "properties",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False, server_default="primary"),
        sa.Column("address", sa.String(length=300), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_properties_family_id", "properties", ["family_id"])

    op.create_table(
        "property_projects",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("property_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="planned"),
        sa.Column("budget", sa.Numeric(12, 2), nullable=True),
        sa.Column("started_at", sa.Date(), nullable=True),
        sa.Column("finished_at", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_property_projects_property_id", "property_projects", ["property_id"])

    op.create_table(
        "property_expenses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("property_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False, server_default="other"),
        sa.Column("receipt_media_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["project_id"], ["property_projects.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["receipt_media_id"], ["media_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_property_expenses_family_id", "property_expenses", ["family_id"])
    op.create_index("ix_property_expenses_property_id", "property_expenses", ["property_id"])

    op.create_table(
        "utility_readings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("property_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("reading_date", sa.Date(), nullable=False),
        sa.Column("value", sa.Numeric(14, 3), nullable=False),
        sa.Column("unit", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_utility_readings_property_id", "utility_readings", ["property_id"])

    op.create_table(
        "property_recurring_costs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("property_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("period", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_property_recurring_costs_property_id", "property_recurring_costs", ["property_id"])

    op.create_table(
        "media_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("media_id", sa.Uuid(), nullable=False),
        sa.Column("target_type", sa.String(length=20), nullable=False),
        sa.Column("target_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["media_id"], ["media_items.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_media_links_media_id", "media_links", ["media_id"])

    op.create_table(
        "vehicles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("registration", sa.String(length=40), nullable=False),
        sa.Column("make", sa.String(length=80), nullable=True),
        sa.Column("model", sa.String(length=120), nullable=True),
        sa.Column("year", sa.Integer(), nullable=True),
        sa.Column("mileage", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vehicles_family_id", "vehicles", ["family_id"])

    op.create_table(
        "vehicle_expenses",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("vehicle_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("category", sa.String(length=20), nullable=False, server_default="other"),
        sa.Column("mileage_at", sa.Integer(), nullable=True),
        sa.Column("receipt_media_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["vehicle_id"], ["vehicles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["receipt_media_id"], ["media_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vehicle_expenses_family_id", "vehicle_expenses", ["family_id"])
    op.create_index("ix_vehicle_expenses_vehicle_id", "vehicle_expenses", ["vehicle_id"])

    op.add_column("tasks", sa.Column("property_id", sa.Uuid(), nullable=True))
    op.add_column("tasks", sa.Column("project_id", sa.Uuid(), nullable=True))
    op.add_column("tasks", sa.Column("vehicle_id", sa.Uuid(), nullable=True))
    op.add_column("tasks", sa.Column("month", sa.Integer(), nullable=True))
    op.add_column("tasks", sa.Column("day_of_month", sa.Integer(), nullable=True))

    op.create_foreign_key("fk_tasks_property_id", "tasks", "properties", ["property_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_tasks_project_id", "tasks", "property_projects", ["project_id"], ["id"], ondelete="SET NULL")
    op.create_foreign_key("fk_tasks_vehicle_id", "tasks", "vehicles", ["vehicle_id"], ["id"], ondelete="SET NULL")


def downgrade() -> None:
    op.drop_constraint("fk_tasks_vehicle_id", "tasks", type_="foreignkey")
    op.drop_constraint("fk_tasks_project_id", "tasks", type_="foreignkey")
    op.drop_constraint("fk_tasks_property_id", "tasks", type_="foreignkey")
    op.drop_column("tasks", "day_of_month")
    op.drop_column("tasks", "month")
    op.drop_column("tasks", "vehicle_id")
    op.drop_column("tasks", "project_id")
    op.drop_column("tasks", "property_id")

    op.drop_index("ix_vehicle_expenses_vehicle_id", table_name="vehicle_expenses")
    op.drop_index("ix_vehicle_expenses_family_id", table_name="vehicle_expenses")
    op.drop_table("vehicle_expenses")

    op.drop_index("ix_vehicles_family_id", table_name="vehicles")
    op.drop_table("vehicles")

    op.drop_index("ix_media_links_media_id", table_name="media_links")
    op.drop_table("media_links")

    op.drop_index("ix_property_recurring_costs_property_id", table_name="property_recurring_costs")
    op.drop_table("property_recurring_costs")

    op.drop_index("ix_utility_readings_property_id", table_name="utility_readings")
    op.drop_table("utility_readings")

    op.drop_index("ix_property_expenses_property_id", table_name="property_expenses")
    op.drop_index("ix_property_expenses_family_id", table_name="property_expenses")
    op.drop_table("property_expenses")

    op.drop_index("ix_property_projects_property_id", table_name="property_projects")
    op.drop_table("property_projects")

    op.drop_index("ix_properties_family_id", table_name="properties")
    op.drop_table("properties")
