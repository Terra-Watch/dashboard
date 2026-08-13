# Canonical Jalri Backend Specification

**Status:** Contract frozen for future implementation  
**Authority:** Project decision brief supplied for this phase  
**Implementation status:** Specification only; APIs and database are not implemented

## Scope and authority

No official Jalri backend documentation is currently available. This document is therefore the canonical project decision for future backend work. Values introduced here are project decisions, not claims about currently implemented firmware or running infrastructure.

No mock data, database tables, API routes, authentication, or WebSockets are created by this document.

## 1. System architecture

```text
BoatNode → SX1278 LoRa → Gateway → Backend → Database → Operations Dashboard
```

The Gateway is the trusted LoRa-to-backend boundary. The frontend is read-oriented and must not directly manipulate telemetry.

Backend implementation separation:

```text
API route → Schema validation → Service → Repository → Database
```

## 2. Canonical identifiers

| Concept | Canonical field | Type | Meaning |
|---|---|---|---|
| BoatNode | `nodeId` | Numeric firmware node identifier | Identifies the LoRa node/device. |
| Vessel | `boatId` | Application vessel identifier | Identifies the application vessel record associated with a node. |
| Gateway | `gatewayId` | Unique identifier | Identifies a gateway. |
| Packet | `packetId` | 32-bit identifier | Identifies a packet. |
| Heartbeat/message | `sequence` | Sequence number | Identifies heartbeat/message sequence position. |

No second identifier for the same concept should be introduced without a contract revision.

## 3. Canonical entities

### 3.1 Boat / Vessel

**Purpose:** Registered vessel record.  
**Status:** PROJECT DECISION

| Field | Type | Required | Meaning |
|---|---|---|---|
| `boatId` | String/application identifier | Required | Unique vessel identifier. |
| `nodeId` | Numeric identifier | Required | Associated LoRa node identifier. |
| `status` | `ONLINE` \| `OFFLINE` | Required/derived | Communication state derived from valid communication and `lastSeen`. |
| `sos` | Boolean | Required | Whether the vessel has an active SOS condition. |
| `battery` | Nullable numeric | Required field, nullable value | Battery value when available. |
| `location` | Nullable `Location` | Required field, nullable value | Last known location when available. |
| `rssi` | Nullable numeric | Required field, nullable value | Received signal strength when available. |
| `snr` | Nullable numeric | Required field, nullable value | Signal-to-noise ratio when available. |
| `rttMs` | Nullable numeric | Required field, nullable value | Round-trip measurement when available. |
| `heartbeatCount` | Counter | Required | Accepted heartbeat count. |
| `lastSeen` | Timestamp | Required | Most recent accepted communication timestamp. |
| `firmware` | Nullable version | Required field, nullable value | Firmware version when available. |
| `registeredAt` | Timestamp | Required | Vessel registration timestamp. |
| `dataSource` | `gateway` \| `mock` | Required | Origin classification; `mock` is not permission to create mock records. |

The initial entity excludes speed, heading, temperature, fuel, engine RPM, water depth, wind, weather, and wave height.

### 3.2 Location

**Purpose:** Last known vessel location.  
**Status:** PROJECT DECISION

```text
location: {
  latitude: number,
  longitude: number
} | null
```

Altitude, speed, heading, course, and accuracy are excluded from the initial contract.

### 3.3 Gateway

**Purpose:** Gateway identity and communication state.  
**Status:** PROJECT DECISION

| Field | Type | Required | Meaning |
|---|---|---|---|
| `gatewayId` | Unique identifier | Required | Identifies the gateway. |
| `status` | `ONLINE` \| `OFFLINE` | Required/derived | Gateway communication state. |
| `lastSeen` | Timestamp | Required | Last observed gateway communication. |
| `firmware` | Nullable version | Required field, nullable value | Gateway firmware version when available. |
| `registeredAt` | Timestamp | Required | Gateway registration timestamp. |

IP, MAC, CPU, RAM, uptime, temperature, location, connected boats, signal strength, and packet metrics are excluded initially.

### 3.4 Heartbeat

**Purpose:** BoatNode liveness communication received by the Gateway.  
**Status:** PROJECT DECISION; wire compatibility requires firmware verification

| Field | Type | Required | Meaning |
|---|---|---|---|
| `packetId` | 32-bit identifier | Required | Packet being received and acknowledged. |
| `sourceNodeId` | Numeric identifier | Required | BoatNode sending the heartbeat. |
| `destination` | Destination identifier/value | Required | Heartbeat destination. |
| `sequence` | Sequence number | Required | Heartbeat/message sequence. |
| `timestamp` | Timestamp | Required | Heartbeat timestamp; clock/source semantics require definition. |

### 3.5 HeartbeatAck

**Purpose:** Acknowledgement tied to one heartbeat.  
**Status:** PROJECT DECISION; wire compatibility requires firmware verification

Packet type is `HeartbeatAck = 4`.

| Field | Type | Required | Meaning |
|---|---|---|---|
| `packetId` | 32-bit identifier | Required | Heartbeat packet being acknowledged. |
| `targetNodeId` | Numeric identifier | Required | BoatNode that sent the heartbeat. |
| `gatewayTimestamp` | Timestamp | Required | Gateway timestamp for the acknowledgement. |

BoatNode accepts the ACK only when packet type is `HeartbeatAck`, source is the Gateway, target matches its `nodeId`, and packet ID matches the heartbeat currently awaiting acknowledgement.

### 3.6 Telemetry

**Purpose:** Initial telemetry associated with accepted communication.  
**Status:** PROJECT DECISION

| Field | Type | Required | Meaning |
|---|---|---|---|
| `battery` | Nullable numeric | Nullable | Battery value when provided. |
| `location` | Nullable `Location` | Nullable | Latitude/longitude when provided. |
| `rssi` | Nullable numeric | Nullable | Signal strength when provided. |
| `snr` | Nullable numeric | Nullable | Signal-to-noise ratio when provided. |
| `rttMs` | Nullable numeric | Nullable | Round-trip measurement when provided. |
| `heartbeatCount` | Counter | Required when derived | Accepted heartbeat count. |
| `lastSeen` | Timestamp | Required when communication exists | Most recent accepted communication. |

### 3.7 Alert

**Purpose:** Operational or emergency alert.  
**Status:** PROJECT DECISION

| Field | Type | Required | Meaning |
|---|---|---|---|
| `alertId` | Identifier | Required | Identifies the alert. |
| `boatId` | Nullable vessel identifier | Optional | Affected vessel when known. |
| `type` | `SOS` \| `SYSTEM` \| `COMMUNICATION` | Required | Alert category. |
| `severity` | `CRITICAL` \| `WARNING` \| `INFO` | Required | Alert severity. |
| `status` | `ACTIVE` \| `ACKNOWLEDGED` \| `RESOLVED` | Required | Alert lifecycle. |
| `message` | Text | Required | Human-readable message. |
| `location` | Nullable `Location` | Optional | Location when known. |
| `createdAt` | Timestamp | Required | Creation timestamp. |
| `resolvedAt` | Nullable timestamp | Optional | Resolution timestamp when resolved. |

### 3.8 SOS

**Purpose:** Emergency alert associated with a vessel/node when known.  
**Status:** PROJECT DECISION

| Field | Type | Required | Meaning |
|---|---|---|---|
| `alertId` | Alert identifier | Required | Associated emergency alert. |
| `boatId` | Vessel identifier | Required when source is known | Associated vessel. |
| `nodeId` | Numeric identifier | Required when source is known | Associated BoatNode. |
| `location` | Nullable `Location` | Optional | Emergency location when known. |
| `createdAt` | Timestamp | Required | SOS creation timestamp. |
| `status` | `ACTIVE` \| `ACKNOWLEDGED` \| `RESOLVED` | Required | SOS lifecycle. |

An active SOS persists until explicitly resolved. Communication loss must not automatically resolve it.

### 3.9 Historical Event

**Purpose:** Operational record of a significant system event.  
**Status:** PROJECT DECISION

| Field | Type | Required | Meaning |
|---|---|---|---|
| `eventId` | Identifier | Required | Identifies the historical event. |
| `eventType` | Enumerated event type | Required | Event category. |
| `boatId` | Nullable vessel identifier | Optional | Related vessel when applicable. |
| `gatewayId` | Nullable gateway identifier | Optional | Related gateway when applicable. |
| `timestamp` | Timestamp | Required | Event time. |
| `details` | Structured event details | Required | Recorded details; arbitrary JSON is not the primary domain model. |

Initial event types:

```text
HEARTBEAT_RECEIVED
HEARTBEAT_ACKNOWLEDGED
SOS_CREATED
SOS_RESOLVED
ALERT_CREATED
ALERT_RESOLVED
BOAT_REGISTERED
GATEWAY_CONNECTED
GATEWAY_DISCONNECTED
```

### 3.10 System Status

**Purpose:** Status of initial Jalri system components.  
**Status:** PROJECT DECISION

Initial components:

```text
BACKEND
DATABASE
GATEWAY
```

Status values:

```text
ONLINE
OFFLINE
DEGRADED
UNKNOWN
```

The frontend should show `UNKNOWN`/unavailable until actual health information exists.

## 4. Canonical enums

| Enum | Values |
|---|---|
| Vessel/Gateway status | `ONLINE`, `OFFLINE` |
| Alert type | `SOS`, `SYSTEM`, `COMMUNICATION` |
| Alert/SOS lifecycle | `ACTIVE`, `ACKNOWLEDGED`, `RESOLVED` |
| Alert severity | `CRITICAL`, `WARNING`, `INFO` |
| System component status | `ONLINE`, `OFFLINE`, `DEGRADED`, `UNKNOWN` |
| Data source | `gateway`, `mock` |
| Historical event type | `HEARTBEAT_RECEIVED`, `HEARTBEAT_ACKNOWLEDGED`, `SOS_CREATED`, `SOS_RESOLVED`, `ALERT_CREATED`, `ALERT_RESOLVED`, `BOAT_REGISTERED`, `GATEWAY_CONNECTED`, `GATEWAY_DISCONNECTED` |

These are contract values, not permission to create fabricated records.

## 5. Heartbeat and ACK protocol

Heartbeat packet type is `2`. BoatNode sends it and Gateway receives and validates it. Normalized concepts are `packetId`, `sourceNodeId`, `destination`, `sequence`, and `timestamp`.

For a valid heartbeat:

1. Validate the packet.
2. Identify the source node.
3. Validate packet ID.
4. Validate sequence.
5. Update vessel `lastSeen`.
6. Increment `heartbeatCount`.
7. Update RSSI/SNR when available.
8. Update RTT when available.
9. Record `HEARTBEAT_RECEIVED`.
10. Gateway sends `HeartbeatAck`.

Duplicate vessel records must not be created.

`HeartbeatAck` packet type is `4` and contains `packetId`, `targetNodeId`, and `gatewayTimestamp`. Generic Acknowledgement type `3` may support other reliable data traffic, but must not be interpreted as `HeartbeatAck`.

The exact wire payload for generic Acknowledgement type `3` is NOT SPECIFIED by this backend contract.

## 6. Gateway/backend boundary

```text
Gateway → validate LoRa packet → identify packet type
        → create normalized backend event → backend service
        → database → dashboard
```

The Gateway is trusted to provide the LoRa-to-backend boundary. Transport, authentication, request envelope, wire serialization, retry behavior, idempotency, and error response are NOT SPECIFIED and require a later decision.

If a valid heartbeat arrives from an unregistered node, use the controlled result `UNREGISTERED_NODE`: record the event, do not silently create a vessel, and do not invent a `boatId`.

## 7. Offline detection

**PROJECT DECISION:** Define one configurable threshold named `BOAT_OFFLINE_TIMEOUT`.

Initial value: **5 minutes**.

- Valid communication within the threshold means `ONLINE`.
- No valid communication within the threshold means `OFFLINE`.
- One missed heartbeat must not immediately mark a vessel offline.
- The value must not be duplicated as unrelated hardcoded thresholds.

Gateway offline detection semantics beyond `lastSeen` are NOT SPECIFIED.

## 8. Database

**PROJECT DECISION:** PostgreSQL, SQLAlchemy 2.x, and Alembic.

Initial tables:

```text
boats
gateways
telemetry
alerts
historical_events
```

Relationships:

```text
boats    1 → many telemetry
boats    1 → many alerts
boats    1 → many historical_events
gateways 1 → many historical_events
```

A heartbeat may update `boats.lastSeen`, `boats.heartbeatCount`, `boats.rssi`, `boats.snr`, and `boats.rttMs`.

Database decisions frozen for implementation:

- Database entities use UUID primary keys.
- `boats.boatId`, `boats.nodeId`, and `gateways.gatewayId` are required and unique.
- Persisted timestamps use PostgreSQL `TIMESTAMP WITH TIME ZONE`; application values use UTC-aware Python datetimes.
- `battery` uses `NUMERIC(5,2)` percentage; `rssi` uses `INTEGER` dBm; `snr` uses `NUMERIC(5,2)` dB; `rttMs` uses `INTEGER` milliseconds; latitude and longitude use `NUMERIC(9,6)` degrees; `heartbeatCount` uses `INTEGER`.
- Foreign keys use internal UUIDs: telemetry `boat_id → boats.id`, alert nullable `boat_id → boats.id`, and historical-event nullable `boat_id → boats.id` / `gateway_id → gateways.id`.
- No automatic retention or deletion is configured; telemetry and historical events are retained indefinitely.
- No hard-delete workflow or cascading deletion of historical records is implemented.
- Required indexes are the unique boat/gateway identifiers; telemetry `(boat_id)`, `(timestamp)`; alerts `(boat_id)`, `(status)`, `(created_at)`; and historical events `(boat_id)`, `(gateway_id)`, `(timestamp)`, `(event_type)`.
- SQLAlchemy 2.x, Alembic, and psycopg are the implementation dependencies.

## 9. REST API contract

The following paths are PROJECT DECISIONS for the initial REST surface. They are not implemented by this task.

```text
GET   /api/boats
GET   /api/boats/{boatId}
POST  /api/boats
PATCH /api/boats/{boatId}

GET /api/gateways
GET /api/gateways/{gatewayId}

GET /api/telemetry
GET /api/boats/{boatId}/telemetry

GET  /api/alerts
GET  /api/alerts/{alertId}
POST /api/alerts/{alertId}/acknowledge
POST /api/alerts/{alertId}/resolve

GET /api/history
GET /api/system-status
GET /health
```

For domain endpoints, request schemas, response envelopes, pagination, validation errors, not-found errors, conflict errors, authentication requirements per route, and exact data sources are NOT SPECIFIED and must be defined before implementation.

## 10. Initial query filters

| Resource | Filters |
|---|---|
| Boats | `search` |
| Alerts | `status`, `type` |
| History | `from`, `to`, `boatId`, `eventType` |
| Telemetry | `boatId`, `from`, `to` |

No elaborate query system is part of the initial contract. Exact types, time semantics, invalid-filter errors, sorting, pagination, and limits are NOT SPECIFIED.

## 11. Authentication and authorization

**PROJECT DECISION:** Initial dashboard authentication is JWT-based.

Roles:

```text
OPERATOR
ADMIN
```

- `OPERATOR`: read operational data, acknowledge alerts, resolve alerts.
- `ADMIN`: all operator permissions, manage boats, manage gateways, manage users.

Token claims, issuer, audience, signing algorithm, expiry, refresh behavior, password policy, user fields, login path, revocation, and exact authorization matrix are NOT SPECIFIED. Authentication is not implemented.

## 12. WebSocket boundary

WebSockets are not implemented initially. Future event categories are:

```text
boat.updated
telemetry.received
alert.created
alert.updated
gateway.updated
system.updated
```

REST remains the initial integration boundary. Authentication, subscriptions, payloads, replay, ordering, and delivery guarantees are NOT SPECIFIED.

## 13. Maritime intelligence and future services

The following are PLANNED / FUTURE and excluded from the initial backend:

- IMBL monitoring
- EEZ monitoring
- Geofencing
- Harbor detection
- Safe-zone monitoring
- Restricted-zone detection
- Safe-return guidance
- Drift prediction
- Dead reckoning
- Route recommendation
- Hazard detection
- Risk scoring
- Battery health prediction
- Link-quality prediction
- Device anomaly detection

They must not add tables, endpoints, fields, or processing to the initial contract.

## 14. Implementation status

| Area | Status |
|---|---|
| Canonical identifiers | DEFINED as PROJECT DECISION |
| Boat/Vessel contract | DEFINED as PROJECT DECISION |
| Gateway contract | DEFINED as PROJECT DECISION |
| Heartbeat normalization | DEFINED; wire compatibility requires verification |
| HeartbeatAck semantics | DEFINED; wire compatibility requires verification |
| Initial telemetry fields | DEFINED as PROJECT DECISION |
| Alert/SOS contract | DEFINED as PROJECT DECISION |
| Historical event contract | DEFINED as PROJECT DECISION |
| System status contract | DEFINED as PROJECT DECISION |
| PostgreSQL/SQLAlchemy/Alembic choice | DEFINED as PROJECT DECISION |
| REST path surface | DEFINED; request/response schemas pending |
| JWT authentication | DEFINED; implementation pending |
| WebSocket event categories | PLANNED / FUTURE |
| Maritime intelligence services | PLANNED / FUTURE |
| Database schema details | NOT SPECIFIED |
| Gateway transport contract | NOT SPECIFIED |
| API request/response/error schemas | NOT SPECIFIED |
| Authentication token/user details | NOT SPECIFIED |

## 15. Explicit project decisions

1. Canonical identifiers are `nodeId`, `boatId`, `gatewayId`, `packetId`, and `sequence`.
2. Initial vessel and gateway statuses are `ONLINE` and `OFFLINE`.
3. Initial telemetry is limited to battery, location, RSSI, SNR, RTT, heartbeat count, and last seen.
4. Alert types are SOS, SYSTEM, and COMMUNICATION.
5. Alert/SOS lifecycle values are ACTIVE, ACKNOWLEDGED, and RESOLVED.
6. System components are BACKEND, DATABASE, and GATEWAY.
7. PostgreSQL, SQLAlchemy 2.x, and Alembic are the planned persistence stack.
8. `BOAT_OFFLINE_TIMEOUT` starts at five minutes and is configurable.
9. The Gateway is the trusted ingestion boundary.
10. No unregistered node automatically creates a vessel record.
11. JWT authentication with OPERATOR and ADMIN roles is the initial access model.
12. REST is the first backend integration boundary; WebSockets remain future work.

## 16. Decisions requiring approval before implementation

- Exact API-facing schema mappings and migration naming conventions.
- Gateway-to-backend transport and authentication.
- Normalized ingestion request envelope.
- API request, response, error, pagination, and sorting schemas.
- Boat registration/provisioning workflow and `boatId` format.
- Gateway registration workflow and `gatewayId` format.
- Heartbeat wire compatibility between current firmware and this contract.
- Packet validation, deduplication, replay protection, and idempotency.
- JWT claims, key management, token lifetime, login, refresh, and user fields.
- SOS ownership, acknowledgement authorization, and resolution audit requirements.
- `dataSource=mock` policy for non-production environments.
