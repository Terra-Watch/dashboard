from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies.auth import operation_boats_for_user, require_operation_boat, require_operations_user
from app.api.dependencies.database import get_db
from app.models.boat import Boat
from app.models.crew_message import CrewMessage
from app.models.user import User
from app.repositories.boats import BoatRepository
from app.schemas.messages import OperationsMessageResponse
from app.services.errors import ResourceNotFoundError


router = APIRouter(prefix="/api/messages", tags=["messages"])
boat_repository = BoatRepository()


@router.get("", response_model=list[OperationsMessageResponse])
def list_messages(
    boatId: str | None = Query(default=None),
    actor: User = Depends(require_operations_user),
    db: Session = Depends(get_db),
) -> list[OperationsMessageResponse]:
    allowed_boat_ids: set[object] | None = None
    if boatId is not None:
        boat = boat_repository.get(db, boatId)
        if boat is None:
            raise ResourceNotFoundError("Boat not found")
        require_operation_boat(actor, boat, db)
        allowed_boat_ids = {boat.id}
    elif actor.role.value not in {"ADMIN", "RESCUER"}:
        allowed_boat_ids = {boat.id for boat in operation_boats_for_user(actor, db)}

    statement = (
        select(CrewMessage)
        .join(CrewMessage.boat)
        .order_by(CrewMessage.createdAt.desc())
        .limit(200)
    )
    if allowed_boat_ids is not None:
        statement = statement.where(CrewMessage.boat_id.in_(allowed_boat_ids))

    messages = list(db.scalars(statement))
    return [
        OperationsMessageResponse(
            id=item.id,
            messageId=item.messageId,
            clientEventId=item.clientEventId,
            boatId=item.boat.boatId,
            sourceUserName=item.source_user.name,
            sourceUserEmail=item.source_user.email,
            text=item.text,
            status=item.status,
            createdAt=item.createdAt,
            dispatchedAt=item.dispatchedAt,
            receivedAt=item.receivedAt,
        )
        for item in messages
    ]
