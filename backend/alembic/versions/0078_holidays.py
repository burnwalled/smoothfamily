"""Public holidays (3.4.0): the family's country for the red days in the calendar – Sweden, Norway,
Denmark, Finland or a part of the United Kingdom; empty is off. An existing family starts from its
admin's language.

Revision ID: 0078_holidays
Revises: 0077_meal_slots
Create Date: 2026-11-02
"""

from alembic import op
import sqlalchemy as sa

revision = "0078_holidays"
down_revision = "0077_meal_slots"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("families", sa.Column("holiday_country", sa.String(6), nullable=True))
    op.execute(
        """
        UPDATE families SET holiday_country = CASE (
            SELECT language FROM users WHERE users.family_id = families.id AND users.role = 'admin'
            ORDER BY users.created_at LIMIT 1
        )
            WHEN 'sv' THEN 'SE' WHEN 'nb' THEN 'NO' WHEN 'da' THEN 'DK' WHEN 'fi' THEN 'FI' WHEN 'en' THEN 'GB-ENG'
        END
        """
    )


def downgrade() -> None:
    op.drop_column("families", "holiday_country")
