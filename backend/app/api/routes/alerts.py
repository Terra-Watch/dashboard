from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.models.enums import AlertStatus, AlertType
from app.schemas.alert import AlertResponse
from app.services.alerts import AlertService
from app.services.serialization import alert_response


router = APIRouter(prefix="/api/alerts", tags=["alerts"])
service = AlertService()


@router.get("", response_model=list[AlertResponse])
def list_alerts(
    status_: AlertStatus | None = Query(default=None, alias="status"),
    type_: AlertType | None = Query(default=None, alias="type"),
    db: Session = Depends(get_db),
) -> list[AlertResponse]:
    return [alert_response(item) for item in service.list(db, status_, type_)]


@router.get("/{alertId}", response_model=AlertResponse)
def get_alert(alertId: str, db: Session = Depends(get_db)) -> AlertResponse:
    return alert_response(service.get(db, alertId))


@router.post("/{alertId}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(alertId: str, db: Session = Depends(get_db)) -> AlertResponse:
    alert = service.acknowledge(db, alertId)
    db.commit()
    return alert_response(alert)


@router.post("/{alertId}/resolve", response_model=AlertResponse)
def resolve_alert(alertId: str, db: Session = Depends(get_db)) -> AlertResponse:
    alert = service.resolve(db, alertId)
    db.commit()
    return alert_response(alert)

