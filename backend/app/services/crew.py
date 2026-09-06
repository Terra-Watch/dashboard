from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.boat import Boat
from app.models.enums import AlertSeverity, AlertStatus, AlertType, IncidentStatus, IncidentType
from app.models.incident import Incident
from app.models.crew_message import CrewMessage
from app.models.user import User
from app.models.user import user_boats
from app.repositories.alerts import AlertRepository
from app.services.errors import ResourceConflictError, ResourceNotFoundError


class CrewService:
    def __init__(self, alerts: AlertRepository | None = None) -> None:
        self.alerts = alerts or AlertRepository()

    def boat(self, user: User, db: Session) -> Boat:
        boats = list(
            db.scalars(
                select(Boat)
                .join(user_boats, user_boats.c.boat_id == Boat.id)
                .where(
                    user_boats.c.user_id == user.id,
                    user_boats.c.assignment_status == "ACTIVE",
                    user_boats.c.relationship_type.in_(("OWNER", "COMMANDER", "CREW")),
                    Boat.lifecycleStatus == "ACTIVE",
                )
                .order_by(Boat.boatId)
            )
        )
        if not boats:
            raise ResourceNotFoundError("No boat assigned")
        boat = boats[0]
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

    def messages_for_boat(self, user: User, db: Session) -> list[CrewMessage]:
        boat = self.boat(user, db)
        return list(db.scalars(select(CrewMessage).where(CrewMessage.boat_id == boat.id).order_by(CrewMessage.createdAt)))

    def create_message(self, user: User, db: Session, client_event_id: UUID, text: str) -> CrewMessage:
        boat = self.boat(user, db)
        existing = db.scalar(select(CrewMessage).where(CrewMessage.clientEventId == client_event_id))
        if existing is not None:
            if existing.boat_id != boat.id or existing.source_user_id != user.id or existing.text != text:
                raise ResourceConflictError("clientEventId already belongs to another message")
            return existing
        message = CrewMessage(
            clientEventId=client_event_id,
            boat_id=boat.id,
            source_user_id=user.id,
            text=text,
            status="QUEUED",
            createdAt=datetime.now(timezone.utc),
        )
        db.add(message)
        try:
            db.flush()
        except IntegrityError as exc:
            db.rollback()
            existing = db.scalar(select(CrewMessage).where(CrewMessage.clientEventId == client_event_id))
            if existing is not None and existing.boat_id == boat.id and existing.source_user_id == user.id and existing.text == text:
                return existing
            raise ResourceConflictError("Unable to create message") from exc
        return message
