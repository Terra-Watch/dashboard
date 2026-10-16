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


class CitizenRegistrationRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    name: str = Field(min_length=1, max_length=255)
    password: str = Field(min_length=8, max_length=128)


class CitizenReportRequest(BaseModel):
    client_key: str = Field(min_length=1, max_length=120)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    state: str = Field(min_length=2, max_length=2)
    description: str = Field(default='', max_length=5000)
    observed_at: str = Field(min_length=1, max_length=80)


class CommunityPostRequest(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class CommunityCommentRequest(BaseModel):
    content: str = Field(min_length=1, max_length=1000)


class CommunityMessageRequest(BaseModel):
    content: str = Field(min_length=1, max_length=1000)


class CommunityReportRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class IncidentAssignmentRequest(BaseModel):
    ranger_id: int = Field(gt=0)
    priority: str = Field(default='normal', pattern='^(low|normal|high|urgent)$')
    due_at: str | None = Field(default=None, max_length=80)


class AssignmentDecisionRequest(BaseModel):
    decision: str = Field(pattern='^(accepted|declined|in_progress)$')


class AssignmentReassignmentRequest(BaseModel):
    ranger_id: int = Field(gt=0)
    priority: str = Field(default='normal', pattern='^(low|normal|high|urgent)$')
    due_at: str | None = Field(default=None, max_length=80)


class VerificationRequest(BaseModel):
    outcome: str
    notes: str = Field(default='', max_length=5000)
    observed_at: str = Field(min_length=1, max_length=80)


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


class IncidentImageReviewRequest(BaseModel):
    status: str
    note: str | None = Field(default=None, max_length=2000)


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
