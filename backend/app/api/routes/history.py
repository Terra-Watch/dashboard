from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.api.dependencies.auth import require_operations_user
from app.models.enums import HistoricalEventType
from app.repositories.boats import BoatRepository
from app.repositories.history import HistoricalEventRepository
from app.schemas.history import HistoricalEventResponse
from app.services.errors import ResourceNotFoundError
from app.services.serialization import history_response


router = APIRouter(prefix="/api/history", tags=["history"])
repository = HistoricalEventRepository()
boat_repository = BoatRepository()


@router.get("", response_model=list[HistoricalEventResponse])
def list_history(
    from_: datetime | None = Query(default=None, alias="from"),
    to: datetime | None = Query(default=None),
    boatId: str | None = Query(default=None),
    eventType: HistoricalEventType | None = Query(default=None),
    db: Session = Depends(get_db),
    _: object = Depends(require_operations_user),
) -> list[HistoricalEventResponse]:
    boat_uuid: UUID | None = None
    if boatId is not None:
        boat = boat_repository.get(db, boatId)
        if boat is None:
            raise ResourceNotFoundError("Boat not found")
        boat_uuid = boat.id
    return [history_response(item) for item in repository.list(db, from_, to, boat_uuid, eventType)]

