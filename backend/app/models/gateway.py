import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base
from app.models.enums import BoatStatus


class Gateway(Base):
    __tablename__ = "gateways"
    __table_args__ = (UniqueConstraint("gatewayId", name="uq_gateways_gateway_id"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    gatewayId: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[BoatStatus] = mapped_column(Enum(BoatStatus, name="gateway_status"), nullable=False)
    lastSeen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    firmware: Mapped[str | None] = mapped_column(String, nullable=True)
    registeredAt: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    historical_events = relationship("HistoricalEvent", back_populates="gateway")

