from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.api.dependencies.auth import operation_boats_for_user, require_operation_boat, require_operations_user
from app.models.user import User
from app.repositories.boats import BoatRepository
from app.repositories.telemetry import TelemetryRepository
from app.schemas.telemetry import TelemetryResponse
from app.services.errors import ResourceNotFoundError
from app.services.serialization import telemetry_response


router = APIRouter(prefix="/api/telemetry", tags=["telemetry"])
telemetry_repository = TelemetryRepository()
boat_repository = BoatRepository()


def list_telemetry(db: Session, boat_id: str | None, from_: datetime | None, to: datetime | None, actor: User) -> list[TelemetryResponse]:
    internal_boat_id = None
    if boat_id is not None:
        boat = boat_repository.get(db, boat_id)
        if boat is None:
            raise ResourceNotFoundError("Boat not found")
        require_operation_boat(actor, boat, db)
        internal_boat_id = boat.id
    records = [telemetry_response(item) for item in telemetry_repository.list(db, internal_boat_id, from_, to)]
    if actor.role.value == "OPERATOR":
        allowed = {boat.id for boat in operation_boats_for_user(actor, db)}
        records = [record for record in records if record.boat_id in allowed]
    return records


@router.get("", response_model=list[TelemetryResponse])
def get_telemetry(
    boatId: str | None = Query(default=None),
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_operations_user),
) -> list[TelemetryResponse]:
    return list_telemetry(db, boatId, from_, to, actor)
