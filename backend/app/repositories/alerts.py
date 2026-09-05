from __future__ import annotations

from sqlalchemy import select
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.alert import Alert
from app.models.enums import AlertStatus, AlertType


class AlertRepository:
    def list(self, db: Session, status: AlertStatus | None = None, type_: AlertType | None = None) -> list[Alert]:
        statement = select(Alert).order_by(Alert.createdAt)
        if status is not None:
            statement = statement.where(Alert.status == status)
        if type_ is not None:
            statement = statement.where(Alert.type == type_)
        return list(db.scalars(statement))

    def list_for_boat(self, db: Session, boat_id: UUID) -> list[Alert]:
        return list(db.scalars(select(Alert).where(Alert.boat_id == boat_id).order_by(Alert.createdAt)))

    def get(self, db: Session, alert_id: str) -> Alert | None:
        return db.scalar(select(Alert).where(Alert.alertId == alert_id))

