from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependencies.auth import require_gateway_ingestion_key
from app.api.dependencies.database import get_db
from app.schemas.ingestion import GatewayHeartbeatEvent, GatewayTelemetryEvent
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
