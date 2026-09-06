from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_gateway_ingestion_key
from app.api.dependencies.database import get_db
from app.schemas.ingestion import GatewayHeartbeatEvent, GatewayTelemetryEvent
from app.schemas.gateway_messages import GatewayMessage, GatewayMessageReceipt
from app.models.crew_message import CrewMessage
from app.models.boat import Boat
from app.models.enums import HistoricalEventType
from app.models.historical_event import HistoricalEvent
from sqlalchemy import select
from datetime import datetime, timezone
from app.services.ingestion import IngestionService


router = APIRouter(prefix="/api/ingest", tags=["internal-ingestion"])
service = IngestionService()


@router.post("/gateway", status_code=status.HTTP_202_ACCEPTED)
def ingest_gateway_event(event: GatewayHeartbeatEvent | GatewayTelemetryEvent,
                         db: Session = Depends(get_db),
                         _: None = Depends(require_gateway_ingestion_key)) -> dict[str, object]:
    result = service.process_heartbeat(db, event) if event.eventType == "HEARTBEAT_RECEIVED" else service.process_telemetry(db, event)
    db.commit()
    return result


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
