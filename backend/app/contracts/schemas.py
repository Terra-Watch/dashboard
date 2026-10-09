from datetime import date
from pydantic import BaseModel

class LoginRequest(BaseModel):
    email: str
    password: str

class PasswordResetRequest(BaseModel):
    email: str

class AccessRequest(BaseModel):
    name: str
    designation: str
    department: str
    email: str
    state: str
    reason: str

class PlanRequest(BaseModel):
    date: date
    region: str
    teams: int
    priority_cells: int

class IncidentRequest(BaseModel):
    client_key: str
    source: str
    size: str
    notes: str = ''

class IncidentStatusUpdate(BaseModel):
    status: str

class AlertRuleRequest(BaseModel):
    name: str
    kind: str
    enabled: bool = True
    channel: str = 'in-app'

class SettingsUpdate(BaseModel):
    locale: str | None = None
    theme: str | None = None
    email_alerts: bool | None = None
    push_alerts: bool | None = None

class SpreadRequest(BaseModel):
    latitude: float
    longitude: float
    duration_hours: int = 12
