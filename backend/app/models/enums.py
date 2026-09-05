from enum import Enum


class BoatStatus(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"


class AlertType(str, Enum):
    SOS = "SOS"
    SYSTEM = "SYSTEM"
    COMMUNICATION = "COMMUNICATION"


class AlertStatus(str, Enum):
    ACTIVE = "ACTIVE"
    ACKNOWLEDGED = "ACKNOWLEDGED"
    RESOLVED = "RESOLVED"


class AlertSeverity(str, Enum):
    CRITICAL = "CRITICAL"
    WARNING = "WARNING"
    INFO = "INFO"


class SystemStatus(str, Enum):
    ONLINE = "ONLINE"
    OFFLINE = "OFFLINE"
    DEGRADED = "DEGRADED"
    UNKNOWN = "UNKNOWN"


class DataSource(str, Enum):
    GATEWAY = "gateway"
    MOCK = "mock"


class HistoricalEventType(str, Enum):
    HEARTBEAT_RECEIVED = "HEARTBEAT_RECEIVED"
    HEARTBEAT_ACKNOWLEDGED = "HEARTBEAT_ACKNOWLEDGED"
    SOS_CREATED = "SOS_CREATED"
    SOS_RESOLVED = "SOS_RESOLVED"
    ALERT_CREATED = "ALERT_CREATED"
    ALERT_RESOLVED = "ALERT_RESOLVED"
    BOAT_REGISTERED = "BOAT_REGISTERED"
    GATEWAY_CONNECTED = "GATEWAY_CONNECTED"
    GATEWAY_DISCONNECTED = "GATEWAY_DISCONNECTED"


class UserRole(str, Enum):
    FAMILY = "FAMILY"
    FISHERMAN = "FISHERMAN"
    OPERATOR = "OPERATOR"
    ADMIN = "ADMIN"
    CREW = "crew"
    RESCUER = "rescuer"


class IncidentType(str, Enum):
    SOS = "SOS"
    MOB = "MOB"
    FALL = "FALL"


class IncidentStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
