from pydantic import BaseModel

from app.models.enums import SystemStatus


class SystemComponentStatus(BaseModel):
    component: str
    status: SystemStatus


class SystemStatusResponse(BaseModel):
    components: list[SystemComponentStatus]

