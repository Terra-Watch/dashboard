from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.repositories.boats import BoatRepository
from app.repositories.telemetry import TelemetryRepository
from app.schemas.telemetry import TelemetryResponse
from app.services.errors import ResourceNotFoundError
from app.services.serialization import telemetry_response


router = APIRouter(prefix="/api/boats", tags=["telemetry"])
boat_repository = BoatRepository()
telemetry_repository = TelemetryRepository()


@router.get("/{boatId}/telemetry", response_model=list[TelemetryResponse])
def get_boat_telemetry(
    boatId: str,
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[TelemetryResponse]:
    boat = boat_repository.get(db, boatId)
    if boat is None:
        raise ResourceNotFoundError("Boat not found")
    return [telemetry_response(item) for item in telemetry_repository.list(db, boat.id, from_, to)]

