from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.gateway import Gateway


class GatewayRepository:
    def list(self, db: Session) -> list[Gateway]:
        return list(db.scalars(select(Gateway).order_by(Gateway.gatewayId)))

    def get(self, db: Session, gateway_id: str) -> Gateway | None:
        return db.scalar(select(Gateway).where(Gateway.gatewayId == gateway_id))

