from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.boat import Boat


class BoatRepository:
    def list(self, db: Session, search: str | None = None) -> list[Boat]:
        statement = select(Boat).order_by(Boat.boatId)
        if search:
            statement = statement.where(Boat.boatId.ilike(f"%{search}%"))
        return list(db.scalars(statement))

    def get(self, db: Session, boat_id: str) -> Boat | None:
        return db.scalar(select(Boat).where(Boat.boatId == boat_id))

    def get_by_node_id(self, db: Session, node_id: int) -> Boat | None:
        return db.scalar(select(Boat).where(Boat.nodeId == node_id))

    def add(self, db: Session, boat: Boat) -> Boat:
        db.add(boat)
        db.flush()
        return boat

