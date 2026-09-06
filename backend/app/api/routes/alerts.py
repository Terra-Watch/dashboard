from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.api.dependencies.auth import operation_boats_for_user, require_operation_boat, require_operations_user
from app.models.boat import Boat
from app.models.user import User
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
    actor: User = Depends(require_operations_user),
) -> list[AlertResponse]:
    allowed = {boat.id for boat in operation_boats_for_user(actor, db)}
    return [alert_response(item) for item in service.list(db, status_, type_) if item.boat_id in allowed]


@router.get("/{alertId}", response_model=AlertResponse)
def get_alert(alertId: str, actor: User = Depends(require_operations_user), db: Session = Depends(get_db)) -> AlertResponse:
    alert = service.get(db, alertId)
    boat = db.query(Boat).filter(Boat.id == alert.boat_id).first()
    if boat: require_operation_boat(actor, boat, db)
    return alert_response(alert)


@router.post("/{alertId}/acknowledge", response_model=AlertResponse)
def acknowledge_alert(alertId: str, actor: User = Depends(require_operations_user), db: Session = Depends(get_db)) -> AlertResponse:
    alert = service.acknowledge(db, alertId)
    boat = db.query(Boat).filter(Boat.id == alert.boat_id).first()
    if boat: require_operation_boat(actor, boat, db)
    db.commit()
    return alert_response(alert)


@router.post("/{alertId}/resolve", response_model=AlertResponse)
def resolve_alert(alertId: str, actor: User = Depends(require_operations_user), db: Session = Depends(get_db)) -> AlertResponse:
    alert = service.resolve(db, alertId)
    boat = db.query(Boat).filter(Boat.id == alert.boat_id).first()
    if boat: require_operation_boat(actor, boat, db)
    db.commit()
    return alert_response(alert)
