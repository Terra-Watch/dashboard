"""make gateway lastseen nullable and support real dynamic heartbeat status

Revision ID: j5e8f1a2b347
Revises: i4d7f0b2c536
"""
from alembic import op
import sqlalchemy as sa


revision = "j5e8f1a2b347"
down_revision = "i4d7f0b2c536"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("gateways", "lastSeen", existing_type=sa.DateTime(timezone=True), nullable=True)


def downgrade() -> None:
    op.alter_column("gateways", "lastSeen", existing_type=sa.DateTime(timezone=True), nullable=False)
