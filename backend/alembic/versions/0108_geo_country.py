"""Where sign-ins come from (3.4.1): the country on each security event, and a member travelling.

Revision ID: 0108_geo_country
Revises: 0107_security_events
Create Date: 2026-11-11
"""

from alembic import op
import sqlalchemy as sa

revision = "0108_geo_country"
down_revision = "0107_security_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("security_events", sa.Column("country", sa.String(2), nullable=True))
    op.add_column("users", sa.Column("travel_until", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "travel_until")
    op.drop_column("security_events", "country")
