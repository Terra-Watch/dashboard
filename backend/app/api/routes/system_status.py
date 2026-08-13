from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies.database import get_db
from app.schemas.system_status import SystemStatusResponse
from app.services.system_status import get_system_status


router = APIRouter(prefix="/api/system-status", tags=["system"])


@router.get("", response_model=SystemStatusResponse)
def system_status(db: Session = Depends(get_db)) -> SystemStatusResponse:
    return get_system_status(db)

