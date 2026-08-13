from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.repositories.gateways import GatewayRepository
from app.schemas.gateway import GatewayResponse


router = APIRouter(prefix="/api/gateways", tags=["gateways"])
repository = GatewayRepository()


@router.get("", response_model=list[GatewayResponse])
def list_gateways(db: Session = Depends(get_db)) -> list[GatewayResponse]:
    return repository.list(db)


@router.get("/{gatewayId}", response_model=GatewayResponse)
def get_gateway(gatewayId: str, db: Session = Depends(get_db)) -> GatewayResponse:
    gateway = repository.get(db, gatewayId)
    if gateway is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Gateway not found")
    return gateway

