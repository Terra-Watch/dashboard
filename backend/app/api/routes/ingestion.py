from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_gateway_ingestion_key
from app.api.dependencies.database import get_db
from app.schemas.ingestion import GatewayHeartbeatEvent, GatewayTelemetryEvent
from app.schemas.gateway_messages import GatewayCrewMessage, GatewayMessage, GatewayMessageReceipt
from app.models.crew_message import CrewMessage
from app.models.boat import Boat
from app.models.user import User, UserRole, user_boats
from app.models.enums import HistoricalEventType
from app.models.historical_event import HistoricalEvent
from sqlalchemy import select
from datetime import datetime, timezone
from app.services.ingestion import IngestionService, UnregisteredNodeError
from app.services.errors import ResourceConflictError


router = APIRouter(prefix="/api/ingest", tags=["internal-ingestion"])
service = IngestionService()


@router.post("/gateway", status_code=status.HTTP_202_ACCEPTED)
def ingest_gateway_event(event: GatewayHeartbeatEvent | GatewayTelemetryEvent,
                         db: Session = Depends(get_db),
                         _: None = Depends(require_gateway_ingestion_key)) -> dict[str, object]:
    result = service.process_heartbeat(db, event) if event.eventType == "HEARTBEAT_RECEIVED" else service.process_telemetry(db, event)
    db.commit()
    return result


@router.post("/gateway/crew-message", status_code=status.HTTP_202_ACCEPTED)
def ingest_gateway_crew_message(event: GatewayCrewMessage,
                                db: Session = Depends(get_db),
                                _: None = Depends(require_gateway_ingestion_key)) -> dict[str, object]:
    boat = db.scalar(select(Boat).where(Boat.nodeId == event.nodeId))
    if boat is None:
        raise UnregisteredNodeError("UNREGISTERED_NODE")

    existing = db.scalar(select(CrewMessage).where(CrewMessage.clientEventId == event.clientEventId))
    if existing is not None:
        if existing.boat_id != boat.id or existing.text != event.text:
            raise ResourceConflictError("clientEventId already belongs to another message")
        if existing.status in {"QUEUED", "DISPATCHED"}:
            now = datetime.now(timezone.utc)
            existing.status = "GATEWAY_RECEIVED"
            existing.dispatchedAt = existing.dispatchedAt or now
            existing.receivedAt = existing.receivedAt or now
            db.commit()
        return {"accepted": True, "duplicate": True, "messageId": str(existing.messageId), "status": existing.status}

    source_user_id = db.scalar(
        select(User.id)
        .join(user_boats, user_boats.c.user_id == User.id)
        .where(
            user_boats.c.boat_id == boat.id,
            user_boats.c.assignment_status == "ACTIVE",
            User.role.in_((UserRole.CREW, UserRole.FISHERMAN)),
            User.is_active.is_(True),
        )
        .order_by(User.id)
    )
    if source_user_id is None:
        raise UnregisteredNodeError("NO_ACTIVE_CREW_ASSIGNMENT")

    now = datetime.now(timezone.utc)
    message = CrewMessage(
        clientEventId=event.clientEventId,
        boat_id=boat.id,
        source_user_id=source_user_id,
        text=event.text,
        status="GATEWAY_RECEIVED",
        createdAt=now,
        dispatchedAt=now,
        receivedAt=now,
    )
    db.add(message)
    db.add(HistoricalEvent(
        eventType=HistoricalEventType.COMMUNICATION_RECEIVED,
        boat_id=boat.id,
        timestamp=now,
        details=event.model_dump(mode="json"),
    ))
    db.commit()
    db.refresh(message)
    return {"accepted": True, "duplicate": False, "messageId": str(message.messageId), "clientEventId": str(message.clientEventId), "status": message.status}


@router.get("/gateway/messages", response_model=list[GatewayMessage])
def poll_gateway_messages(db: Session = Depends(get_db), _: None = Depends(require_gateway_ingestion_key)) -> list[GatewayMessage]:
    rows = list(db.execute(
        select(CrewMessage, Boat.nodeId)
        .join(Boat, Boat.id == CrewMessage.boat_id)
        .where(CrewMessage.status == "QUEUED", Boat.nodeId.is_not(None))
        .order_by(CrewMessage.createdAt)
        .limit(8)
    ))
    return [GatewayMessage(messageId=row[0].messageId, clientEventId=row[0].clientEventId, nodeId=row[1], text=row[0].text, createdAt=row[0].createdAt) for row in rows]


@router.post("/gateway/messages/receipt", status_code=status.HTTP_202_ACCEPTED)
def receive_gateway_message_receipt(receipt: GatewayMessageReceipt, db: Session = Depends(get_db), _: None = Depends(require_gateway_ingestion_key)) -> dict[str, object]:
    if receipt.messageId is None and receipt.clientEventId is None:
        return {"accepted": False}
    message = db.scalar(select(CrewMessage).where(
        CrewMessage.messageId == receipt.messageId if receipt.messageId is not None else CrewMessage.clientEventId == receipt.clientEventId
    ))
    if message is None:
        return {"accepted": False}
    if message.status in {"QUEUED", "DISPATCHED"}:
        message.status = "BOATNODE_RECEIVED" if receipt.boatNodeReceived else "DISPATCHED"
        message.dispatchedAt = message.dispatchedAt or datetime.now(timezone.utc)
        if receipt.boatNodeReceived:
            message.receivedAt = datetime.now(timezone.utc)
        db.add(HistoricalEvent(
            eventType=HistoricalEventType.COMMUNICATION_RECEIVED,
            boat_id=message.boat_id,
            timestamp=datetime.now(timezone.utc),
            details={"messageId": str(message.messageId), "clientEventId": str(message.clientEventId), "nodeId": receipt.nodeId, "sequence": receipt.sequence, "text": message.text, "status": message.status},
        ))
        db.commit()
    return {"accepted": True, "status": message.status}
