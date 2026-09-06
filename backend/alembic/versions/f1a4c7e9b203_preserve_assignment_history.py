"""preserve historical boat assignments

Revision ID: f1a4c7e9b203
Revises: e8a2b4c6d901
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f1a4c7e9b203"
down_revision = "e8a2b4c6d901"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user_boats", sa.Column("id", postgresql.UUID(as_uuid=True), nullable=True, server_default=sa.text("gen_random_uuid()")))
    op.alter_column("user_boats", "id", nullable=False, server_default=None)
    op.drop_constraint("user_boats_pkey", "user_boats", type_="primary")
    op.create_primary_key("user_boats_pkey", "user_boats", ["id"])


def downgrade() -> None:
    op.drop_constraint("user_boats_pkey", "user_boats", type_="primary")
    op.create_primary_key("user_boats_pkey", "user_boats", ["user_id", "boat_id"])
    op.drop_column("user_boats", "id")
