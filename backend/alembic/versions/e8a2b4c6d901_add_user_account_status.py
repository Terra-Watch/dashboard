"""add user account lifecycle status

Revision ID: e8a2b4c6d901
Revises: d7f1c3a8b902
"""
from alembic import op
import sqlalchemy as sa

revision = "e8a2b4c6d901"
down_revision = "d7f1c3a8b902"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("account_status", sa.String(), nullable=False, server_default="ACTIVE"))


def downgrade() -> None:
    op.drop_column("users", "account_status")
