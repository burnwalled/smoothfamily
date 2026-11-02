"""The recipe book: a recipe's source link, category and favourite, and each member's stars.

Revision ID: 0065_recipe_book
Revises: 0064_home_gateways
Create Date: 2026-10-30
"""

from alembic import op
import sqlalchemy as sa

revision = "0065_recipe_book"
down_revision = "0064_home_gateways"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("recipes", sa.Column("source_url", sa.String(2000), nullable=True))
    op.add_column("recipes", sa.Column("category", sa.String(20), nullable=False, server_default=""))
    op.add_column("recipes", sa.Column("favorite", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "recipe_ratings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("recipe_id", sa.Uuid(), sa.ForeignKey("recipes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("family_id", sa.Uuid(), sa.ForeignKey("families.id"), nullable=False),
        sa.Column("stars", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("recipe_id", "user_id", name="uq_recipe_rating"),
    )
    op.create_index("ix_recipe_ratings_recipe_id", "recipe_ratings", ["recipe_id"])
    op.create_index("ix_recipe_ratings_family_id", "recipe_ratings", ["family_id"])
    # Pasted recipes kept their page's address as the description: it becomes the source link.
    op.execute(
        "UPDATE recipes SET source_url = description, description = NULL "
        "WHERE description LIKE 'http%' AND description NOT LIKE '% %'"
    )


def downgrade() -> None:
    op.drop_table("recipe_ratings")
    op.execute("UPDATE recipes SET description = source_url WHERE description IS NULL AND source_url IS NOT NULL")
    for column in ("favorite", "category", "source_url"):
        op.drop_column("recipes", column)
