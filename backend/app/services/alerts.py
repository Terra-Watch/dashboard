from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.enums import AlertStatus, AlertType
from app.repositories.alerts import AlertRepository
from app.services.errors import InvalidTransitionError, ResourceNotFoundError


class AlertService:
    def __init__(self, repository: AlertRepository | None = None) -> None:
        self.repository = repository or AlertRepository()

    def list(self, db: Session, status: AlertStatus | None = None, type_: AlertType | None = None) -> list[Alert]:
        return self.repository.list(db, status, type_)

    def get(self, db: Session, alert_id: str) -> Alert:
        alert = self.repository.get(db, alert_id)
        if alert is None:
            raise ResourceNotFoundError("Alert not found")
        return alert

    def acknowledge(self, db: Session, alert_id: str) -> Alert:
        alert = self.get(db, alert_id)
        if alert.status != AlertStatus.ACTIVE:
            raise InvalidTransitionError("Only ACTIVE alerts can be acknowledged")
        alert.status = AlertStatus.ACKNOWLEDGED
        return alert

    def resolve(self, db: Session, alert_id: str) -> Alert:
        alert = self.get(db, alert_id)
        if alert.status not in {AlertStatus.ACTIVE, AlertStatus.ACKNOWLEDGED}:
            raise InvalidTransitionError("Only ACTIVE or ACKNOWLEDGED alerts can be resolved")
        alert.status = AlertStatus.RESOLVED
        return alert

