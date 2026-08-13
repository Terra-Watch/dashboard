from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.enums import HistoricalEventType
from app.models.historical_event import HistoricalEvent
from app.repositories.boats import BoatRepository
from app.repositories.ingestion import IngestionRepository
from app.schemas.ingestion import GatewayHeartbeatEvent
from app.services.errors import ResourceNotFoundError


class UnregisteredNodeError(Exception):
    pass


class IngestionService:
    def __init__(self, boats: BoatRepository | None = None, ingestion: IngestionRepository | None = None) -> None:
        self.boats = boats or BoatRepository()
        self.ingestion = ingestion or IngestionRepository()

    def process_heartbeat(self, db: Session, event: GatewayHeartbeatEvent) -> dict[str, object]:
        boat = self.boats.get_by_node_id(db, event.nodeId)
        if boat is None:
            raise UnregisteredNodeError("UNREGISTERED_NODE")

        duplicate = self.ingestion.find_heartbeat_event(db, event.nodeId, event.packetId)
        if duplicate is not None:
            return {"accepted": True, "duplicate": True, "condition": "DUPLICATE_EVENT"}

        received_at = datetime.now(timezone.utc)
        boat.lastSeen = received_at
        boat.heartbeatCount += 1
        if event.rssi is not None:
            boat.rssi = event.rssi
        if event.snr is not None:
            boat.snr = event.snr

        history = HistoricalEvent(
            eventType=HistoricalEventType.HEARTBEAT_RECEIVED,
            boat_id=boat.id,
            gateway_id=None,
            timestamp=received_at,
            details=event.model_dump(mode="json"),
        )
        db.add(history)
        db.flush()
        return {"accepted": True, "duplicate": False, "condition": "HEARTBEAT_PROCESSED"}

