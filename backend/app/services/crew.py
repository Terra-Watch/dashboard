from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.boat import Boat
from app.models.enums import AlertSeverity, AlertStatus, AlertType, IncidentStatus, IncidentType
from app.models.incident import Incident
from app.models.user import User
from app.repositories.alerts import AlertRepository
from app.services.errors import ResourceConflictError, ResourceNotFoundError


class CrewService:
    def __init__(self, alerts: AlertRepository | None = None) -> None:
        self.alerts = alerts or AlertRepository()

    def boat(self, user: User, db: Session) -> Boat:
        if not user.boats:
            raise ResourceNotFoundError("No boat assigned")
        boat = user.boats[0]
        if boat is None:
            raise ResourceNotFoundError("Assigned boat not found")
        return boat

    def alerts_for_boat(self, user: User, db: Session) -> list[Alert]:
        return self.alerts.list_for_boat(db, self.boat(user, db).id)

    def create_sos(self, user: User, db: Session, client_event_id: UUID, location, created_offline: bool = False) -> Incident:
        boat = self.boat(user, db)
        existing = db.scalar(select(Incident).where(Incident.clientEventId == client_event_id))
        if existing is not None:
            latitude = location.latitude if location else None
            longitude = location.longitude if location else None
            if (
                existing.boat_id != boat.id
                or existing.type != IncidentType.SOS
                or existing.sourceLatitude != latitude
                or existing.sourceLongitude != longitude
                or existing.createdOffline != created_offline
            ):
                raise ResourceConflictError("clientEventId already belongs to another incident")
            return existing

        now = datetime.now(timezone.utc)
        incident = Incident(
            clientEventId=client_event_id,
            type=IncidentType.SOS,
            boat_id=boat.id,
            sourceLatitude=location.latitude if location else None,
            sourceLongitude=location.longitude if location else None,
            status=IncidentStatus.OPEN,
            createdAt=now,
            createdOffline=created_offline,
        )
        db.add(incident)
        db.flush()
        db.add(Alert(
            alertId=incident.incidentId,
            boat_id=boat.id,
            type=AlertType.SOS,
            severity=AlertSeverity.CRITICAL,
            status=AlertStatus.ACTIVE,
            message="Crew SOS received",
            latitude=incident.sourceLatitude,
            longitude=incident.sourceLongitude,
            createdAt=now,
            resolvedAt=None,
        ))
        try:
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            existing = db.scalar(select(Incident).where(Incident.clientEventId == client_event_id))
            if existing is not None:
                return existing
            raise ResourceConflictError("Unable to create incident") from exc
        return incident
