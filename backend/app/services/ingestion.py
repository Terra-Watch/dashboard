from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.enums import BoatStatus, HistoricalEventType
from app.models.gateway import Gateway
from app.models.historical_event import HistoricalEvent
from app.models.telemetry import Telemetry
from app.models.device import BoatDevice
from app.repositories.boats import BoatRepository
from app.repositories.ingestion import IngestionRepository
from app.schemas.ingestion import GatewayHeartbeatEvent, GatewayTelemetryEvent
from app.services.errors import ResourceNotFoundError


class UnregisteredNodeError(Exception):
    pass


class IngestionService:
    def __init__(self, boats: BoatRepository | None = None, ingestion: IngestionRepository | None = None) -> None:
        self.boats = boats or BoatRepository()
        self.ingestion = ingestion or IngestionRepository()

    def _update_gateway_last_seen(self, db: Session, received_at: datetime, destination: int | None = None) -> Gateway:
        gateway = None
        if destination is not None and destination != 255:
            target_id = f"GW-{destination:02X}"
            gateway = db.query(Gateway).filter(Gateway.gatewayId == target_id).first()
        if gateway is None:
            gateway = db.query(Gateway).first()
        if gateway is None:
            gateway = Gateway(
                gatewayId="GW-FE",
                status=BoatStatus.ONLINE,
                lastSeen=received_at,
                registeredAt=received_at,
            )
            db.add(gateway)
            db.flush()
        else:
            gateway.lastSeen = received_at
            gateway.status = BoatStatus.ONLINE
        return gateway

    def process_heartbeat(self, db: Session, event: GatewayHeartbeatEvent) -> dict[str, object]:
        boat = self.boats.get_by_node_id(db, event.nodeId)
        if boat is None:
            raise UnregisteredNodeError("UNREGISTERED_NODE")

        duplicate = self.ingestion.find_heartbeat_event(db, event.nodeId, event.packetId)
        if duplicate is not None:
            return {"accepted": True, "duplicate": True, "condition": "DUPLICATE_EVENT"}

        received_at = datetime.now(timezone.utc)
        boat.lastSeen = received_at
        device = db.query(BoatDevice).filter(BoatDevice.boat_id == boat.id, BoatDevice.node_id == event.nodeId, BoatDevice.status == "ACTIVE").first()
        if device:
            device.last_seen = received_at
        boat.heartbeatCount += 1
        if event.rssi is not None:
            boat.rssi = event.rssi
        if event.snr is not None:
            boat.snr = event.snr

        gateway = self._update_gateway_last_seen(db, received_at, destination=event.destination)

        history = HistoricalEvent(
            eventType=HistoricalEventType.HEARTBEAT_RECEIVED,
            boat_id=boat.id,
            gateway_id=gateway.id if gateway else None,
            timestamp=received_at,
            details=event.model_dump(mode="json"),
        )
        db.add(history)
        db.flush()
        return {"accepted": True, "duplicate": False, "condition": "HEARTBEAT_PROCESSED"}

    def process_telemetry(self, db: Session, event: GatewayTelemetryEvent) -> dict[str, object]:
        boat = self.boats.get_by_node_id(db, event.nodeId)
        if boat is None:
            raise UnregisteredNodeError("UNREGISTERED_NODE")

        sensor_timestamp = None
        if event.rtcValid:
            sensor_timestamp = datetime(event.year, event.month, event.day, event.hour, event.minute, event.second,
                                        tzinfo=timezone.utc)
        existing = None
        if sensor_timestamp is not None:
            existing = db.query(Telemetry).filter(
                Telemetry.boat_id == boat.id,
                Telemetry.sensorTimestamp == sensor_timestamp,
            ).first()
        if existing is not None:
            return {"accepted": True, "duplicate": True, "condition": "DUPLICATE_TELEMETRY"}

        received_at = datetime.now(timezone.utc)
        boat.lastSeen = received_at
        has_valid_gps = event.latitude is not None and event.longitude is not None
        if has_valid_gps:
            boat.latitude = event.latitude
            boat.longitude = event.longitude
        device = db.query(BoatDevice).filter(BoatDevice.boat_id == boat.id, BoatDevice.node_id == event.nodeId, BoatDevice.status == "ACTIVE").first()
        if device:
            device.last_seen = received_at

        gateway = self._update_gateway_last_seen(db, received_at)

        telemetry = Telemetry(
            boat_id=boat.id,
            device_id=device.id if device else None,
            rssi=event.rssi,
            snr=event.snr,
            latitude=event.latitude if has_valid_gps else None,
            longitude=event.longitude if has_valid_gps else None,
            rtcTemperatureC=event.temperatureC if event.rtcValid else None,
            sensorTimestamp=sensor_timestamp,
            heartbeatCount=boat.heartbeatCount,
            timestamp=received_at,
        )
        db.add(telemetry)
        return {"accepted": True, "duplicate": False, "condition": "TELEMETRY_PROCESSED"}
