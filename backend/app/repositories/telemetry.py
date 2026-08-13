from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.telemetry import Telemetry


class TelemetryRepository:
    def list(self, db: Session, boat_id: UUID | None = None, from_: datetime | None = None, to: datetime | None = None) -> list[Telemetry]:
        statement = select(Telemetry).order_by(Telemetry.timestamp)
        if boat_id is not None:
            statement = statement.where(Telemetry.boat_id == boat_id)
        if from_ is not None:
            statement = statement.where(Telemetry.timestamp >= from_)
        if to is not None:
            statement = statement.where(Telemetry.timestamp <= to)
        return list(db.scalars(statement))

