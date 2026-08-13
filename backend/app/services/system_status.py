from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.enums import SystemStatus
from app.schemas.system_status import SystemComponentStatus, SystemStatusResponse


def get_system_status(db: Session) -> SystemStatusResponse:
    components = [SystemComponentStatus(component="BACKEND", status=SystemStatus.ONLINE)]
    try:
        db.execute(text("SELECT 1"))
        components.append(SystemComponentStatus(component="DATABASE", status=SystemStatus.ONLINE))
    except Exception:
        components.append(SystemComponentStatus(component="DATABASE", status=SystemStatus.UNKNOWN))
    components.append(SystemComponentStatus(component="GATEWAY", status=SystemStatus.UNKNOWN))
    return SystemStatusResponse(components=components)

