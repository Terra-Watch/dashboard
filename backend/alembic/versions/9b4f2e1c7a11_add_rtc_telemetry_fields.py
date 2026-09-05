"""add RTC telemetry fields

Revision ID: 9b4f2e1c7a11
Revises: 9f4d2b7c1a10
"""
from alembic import op
import sqlalchemy as sa

revision = "9b4f2e1c7a11"
down_revision = "9f4d2b7c1a10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("telemetry", sa.Column("rtcTemperatureC", sa.Numeric(5, 2), nullable=True))
    op.add_column("telemetry", sa.Column("sensorTimestamp", sa.DateTime(timezone=True), nullable=True))
    op.create_index("ix_telemetry_sensorTimestamp", "telemetry", ["sensorTimestamp"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_telemetry_sensorTimestamp", table_name="telemetry")
    op.drop_column("telemetry", "sensorTimestamp")
    op.drop_column("telemetry", "rtcTemperatureC")
