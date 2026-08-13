from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import HistoricalEventType
from app.models.historical_event import HistoricalEvent


class IngestionRepository:
    def find_heartbeat_event(self, db: Session, node_id: int, packet_id: int) -> HistoricalEvent | None:
        statement = select(HistoricalEvent).where(
            HistoricalEvent.eventType == HistoricalEventType.HEARTBEAT_RECEIVED,
            HistoricalEvent.details["nodeId"].as_integer() == node_id,
            HistoricalEvent.details["packetId"].as_integer() == packet_id,
        )
        return db.scalar(statement)

