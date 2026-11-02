"""Phase J: recipes, ingredient categories, and meal planning links.

Revision ID: 0011_recipes
Revises: 0010_lists
Create Date: 2026-06-12
"""

from alembic import op
import sqlalchemy as sa


revision = "0011_recipes"
down_revision = "0010_lists"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("meal_ingredients", sa.Column("category", sa.String(length=20), nullable=True))

    op.create_table(
        "recipes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("servings", sa.Integer(), nullable=False, server_default=sa.text("4")),
        sa.Column("photo_key", sa.String(length=500), nullable=True),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recipes_family_id", "recipes", ["family_id"])

    op.create_table(
        "recipe_ingredients",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("amount", sa.Float(), nullable=True),
        sa.Column("unit", sa.String(length=20), nullable=True),
        sa.Column("category", sa.String(length=20), nullable=True),
        sa.ForeignKeyConstraint(["family_id"], ["families.id"]),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_recipe_ingredients_recipe_id", "recipe_ingredients", ["recipe_id"])
    op.create_index("ix_recipe_ingredients_family_id", "recipe_ingredients", ["family_id"])


def downgrade() -> None:
    op.drop_index("ix_recipe_ingredients_family_id", table_name="recipe_ingredients")
    op.drop_index("ix_recipe_ingredients_recipe_id", table_name="recipe_ingredients")
    op.drop_table("recipe_ingredients")
    op.drop_index("ix_recipes_family_id", table_name="recipes")
    op.drop_table("recipes")
    op.drop_column("meal_ingredients", "category")
