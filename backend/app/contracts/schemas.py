from datetime import date
from pydantic import BaseModel, Field


class LoginRequest(BaseModel):
    email: str
    password: str


class PasswordResetRequest(BaseModel):
    email: str


class RedesignLoginRequest(BaseModel):
    email: str
    password: str


class InviteCreateRequest(BaseModel):
    email: str
    role: str
    scopes: list[str] = Field(default_factory=list)


class InviteAcceptRequest(BaseModel):
    password: str = Field(min_length=8)


class AdminPasswordResetRequest(BaseModel):
    user_id: int


class PasswordResetCompleteRequest(BaseModel):
    password: str = Field(min_length=8)


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
    state: str | None = None


class IncidentStatusUpdate(BaseModel):
    status: str
    notes: str | None = None


class FieldReportCreateRequest(BaseModel):
    idempotency_key: str
    task_id: str
    incident_id: int | None = None
    note: str = ''
    photo_name: str | None = None
    device_id: str
    captured_at: str
    state: str | None = None


class AlertRuleRequest(BaseModel):
    name: str
    kind: str
    enabled: bool = True
    channel: str = 'in-app'
    state: str | None = None
    severity: str = 'warning'
    conditions: dict = Field(default_factory=dict)


class OperationalAlertCreateRequest(BaseModel):
    kind: str
    message: str
    state: str
    severity: str = 'warning'
    entity_type: str | None = None
    entity_id: str | None = None
    rule_id: int | None = None


class SettingsUpdate(BaseModel):
    locale: str | None = None
    theme: str | None = None
    email_alerts: bool | None = None
    push_alerts: bool | None = None


class SpreadRequest(BaseModel):
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    duration_hours: int = Field(default=12, ge=1, le=48)
