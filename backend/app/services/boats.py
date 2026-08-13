from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.boat import Boat
from app.repositories.boats import BoatRepository
from app.schemas.boat import BoatCreate, BoatUpdate
from app.services.errors import ResourceConflictError, ResourceNotFoundError


class BoatService:
    def __init__(self, repository: BoatRepository | None = None) -> None:
        self.repository = repository or BoatRepository()

    def list(self, db: Session, search: str | None = None) -> list[Boat]:
        return self.repository.list(db, search)

    def get(self, db: Session, boat_id: str) -> Boat:
        boat = self.repository.get(db, boat_id)
        if boat is None:
            raise ResourceNotFoundError("Boat not found")
        return boat

    def create(self, db: Session, payload: BoatCreate) -> Boat:
        if self.repository.get(db, payload.boatId) is not None or self.repository.get_by_node_id(db, payload.nodeId) is not None:
            raise ResourceConflictError("boatId or nodeId already exists")
        location = payload.location
        boat = Boat(
            boatId=payload.boatId,
            nodeId=payload.nodeId,
            status=payload.status,
            sos=payload.sos,
            battery=payload.battery,
            latitude=location.latitude if location else None,
            longitude=location.longitude if location else None,
            rssi=payload.rssi,
            snr=payload.snr,
            rttMs=payload.rttMs,
            heartbeatCount=payload.heartbeatCount,
            lastSeen=payload.lastSeen,
            firmware=payload.firmware,
            registeredAt=payload.registeredAt,
            dataSource=payload.dataSource,
        )
        try:
            return self.repository.add(db, boat)
        except IntegrityError as exc:
            db.rollback()
            raise ResourceConflictError("boatId or nodeId already exists") from exc

    def update(self, db: Session, boat_id: str, payload: BoatUpdate) -> Boat:
        boat = self.get(db, boat_id)
        values = payload.model_dump(exclude_unset=True)
        location = values.pop("location", None) if "location" in values else None
        for field, value in values.items():
            setattr(boat, field, value)
        if "location" in payload.model_fields_set:
            boat.latitude = location.latitude if location else None
            boat.longitude = location.longitude if location else None
        return boat

