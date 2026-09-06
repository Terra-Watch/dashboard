from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.boat import Boat
from app.models.device import BoatDevice


class BoatRepository:
    def list(self, db: Session, search: str | None = None) -> list[Boat]:
        statement = select(Boat).order_by(Boat.boatId)
        if search:
            statement = statement.where(Boat.boatId.ilike(f"%{search}%"))
        return list(db.scalars(statement))

    def get(self, db: Session, boat_id: str) -> Boat | None:
        return db.scalar(select(Boat).where(Boat.boatId == boat_id))

    def get_by_node_id(self, db: Session, node_id: int) -> Boat | None:
        device_boat = db.scalar(
            select(Boat)
            .join(BoatDevice, BoatDevice.boat_id == Boat.id)
            .where(BoatDevice.node_id == node_id, BoatDevice.status == "ACTIVE")
        )
        if device_boat is not None:
            return device_boat
        # Compatibility for test/legacy databases before device backfill.
        return db.scalar(select(Boat).where(Boat.nodeId == node_id))

    def add(self, db: Session, boat: Boat) -> Boat:
        db.add(boat)
        db.flush()
        return boat
