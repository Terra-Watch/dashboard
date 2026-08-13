from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import HistoricalEventType
from app.models.historical_event import HistoricalEvent


class HistoricalEventRepository:
    def list(self, db: Session, from_: datetime | None = None, to: datetime | None = None, boat_id: UUID | None = None, event_type: HistoricalEventType | None = None) -> list[HistoricalEvent]:
        statement = select(HistoricalEvent).order_by(HistoricalEvent.timestamp)
        if from_ is not None:
            statement = statement.where(HistoricalEvent.timestamp >= from_)
        if to is not None:
            statement = statement.where(HistoricalEvent.timestamp <= to)
        if boat_id is not None:
            statement = statement.where(HistoricalEvent.boat_id == boat_id)
        if event_type is not None:
            statement = statement.where(HistoricalEvent.eventType == event_type)
        return list(db.scalars(statement))

