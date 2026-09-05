from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_role
from app.api.dependencies.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.mobile_crew import IncidentResponse, SosRequest, SyncRequest, SyncResponse, SyncResult
from app.services.crew import CrewService
from app.services.serialization import alert_response, boat_response


router = APIRouter(prefix="/api/mobile/crew", tags=["mobile-crew"])
service = CrewService()
crew_user = require_role(UserRole.CREW)


def incident_response(incident) -> IncidentResponse:
    return IncidentResponse.model_validate(incident)


@router.get("/me/boat")
def get_my_boat(user: Annotated[User, Depends(crew_user)], db: Session = Depends(get_db)):
    return boat_response(service.boat(user, db))


@router.get("/alerts")
def get_my_alerts(user: Annotated[User, Depends(crew_user)], db: Session = Depends(get_db)):
    return [alert_response(item) for item in service.alerts_for_boat(user, db)]


@router.post("/sos", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
def create_sos(payload: SosRequest, user: Annotated[User, Depends(crew_user)], db: Session = Depends(get_db)) -> IncidentResponse:
    incident = service.create_sos(user, db, payload.clientEventId, payload.location, payload.createdOffline)
    db.commit()
    return incident_response(incident)


@router.post("/sync", response_model=SyncResponse)
def sync(payload: SyncRequest, user: Annotated[User, Depends(crew_user)], db: Session = Depends(get_db)) -> SyncResponse:
    results: list[SyncResult] = []
    for operation in payload.operations:
        try:
            incident = service.create_sos(user, db, operation.clientEventId, operation.location, operation.createdOffline)
            db.commit()
            results.append(SyncResult(clientEventId=operation.clientEventId, accepted=True, incident=incident_response(incident)))
        except Exception as exc:
            db.rollback()
            results.append(SyncResult(clientEventId=operation.clientEventId, accepted=False, error=str(exc)))
    return SyncResponse(results=results)
