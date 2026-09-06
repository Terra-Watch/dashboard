"""add boat and assignment lifecycle fields

Revision ID: d7f1c3a8b902
Revises: c4e7a91d2f30
"""
from alembic import op
import sqlalchemy as sa

revision = "d7f1c3a8b902"
down_revision = "c4e7a91d2f30"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("boats", sa.Column("lifecycleStatus", sa.String(), nullable=False, server_default="ACTIVE"))
    op.add_column("user_boats", sa.Column("assignment_status", sa.String(), nullable=False, server_default="ACTIVE"))
    op.add_column("user_boats", sa.Column("started_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("user_boats", sa.Column("ended_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("user_boats", "ended_at")
    op.drop_column("user_boats", "started_at")
    op.drop_column("user_boats", "assignment_status")
    op.drop_column("boats", "lifecycleStatus")
