# JALRI Backend Data Contract

**Status:** Contract not yet defined  
**Source:** [`docs/JALRI_SPECIFICATION.md`](./JALRI_SPECIFICATION.md)  
**Scope:** Backend foundation only

## Source-of-truth rule

The current Jalri specification states that the official project documentation is pending and marks product capabilities, fields, protocols, and workflows as **NOT SPECIFIED IN SOURCE DOCUMENTATION**.

This document records that boundary for backend work. It does not create application entities, infer fields, or establish an API/database contract.

## Canonical entities

No canonical backend entities are currently defined. The candidate areas below were named in the specification brief, but their fields and behavior remain undefined.

### Boat / Vessel

**Purpose:** NOT SPECIFIED  
**Status:** NOT SPECIFIED

| Field | Type | Required | Description | Source |
|---|---|---|---|---|
| No fields defined | — | — | NOT SPECIFIED | `docs/JALRI_SPECIFICATION.md`, BoatNode section |

Identifiers, relationships, timestamps, enumerations, lifecycle, and persistence requirements are **NOT SPECIFIED**.

### Gateway

**Purpose:** NOT SPECIFIED  
**Status:** NOT SPECIFIED

| Field | Type | Required | Description | Source |
|---|---|---|---|---|
| No fields defined | — | — | NOT SPECIFIED | `docs/JALRI_SPECIFICATION.md`, Gateway section |

Gateway identity, communication state, ingestion payload, timestamps, and relationships are **NOT SPECIFIED**.

### Heartbeat

**Purpose:** NOT SPECIFIED  
**Status:** NOT SPECIFIED

No heartbeat fields, packet format, source, timestamp semantics, validation, or processing behavior are defined.

### Telemetry

**Purpose:** NOT SPECIFIED  
**Status:** NOT SPECIFIED

No telemetry fields, types, units, timestamps, source, frequency, validation, or storage requirements are defined.

### Alert / SOS

**Purpose:** NOT SPECIFIED  
**Status:** NOT SPECIFIED

No trigger, identifier, status, type, severity, timestamp, location, acknowledgement, escalation, or relationship fields are defined.

### Location

**Purpose:** NOT SPECIFIED  
**Status:** NOT SPECIFIED

No coordinate fields, coordinate system, precision, source, timestamp, or relationship to a vessel/event is defined.

### Historical Event

**Purpose:** NOT SPECIFIED  
**Status:** NOT SPECIFIED

No event fields, event types, identifiers, timestamps, source, payload, retention, or query requirements are defined.

### System Status

**Purpose:** NOT SPECIFIED  
**Status:** NOT SPECIFIED

No component list, status values, health fields, check timestamps, or service model is defined.

### User

**Purpose:** NOT SPECIFIED  
**Status:** NOT SPECIFIED

No identity, role, permission, authentication, or authorization fields are defined.

## Relationships and timestamps

Relationships between candidate entities are **NOT SPECIFIED**.

Timestamp fields and timestamp semantics are **NOT SPECIFIED**. No timestamps may be added to backend schemas, persistence, or API responses until the source documentation defines them.

## API contract

No domain API is supported by the current specification. The only implemented endpoint is the Phase 0 health check:

| Method | Path | Request | Response | Errors | Data source |
|---|---|---|---|---|---|
| GET | `/health` | None | `{ "status": "healthy" }` | Standard FastAPI errors only | Process availability |

The following domain endpoints are **NOT IMPLEMENTED** because their contracts are undefined:

- `/boats`
- `/gateway`
- `/telemetry`
- `/alerts`
- `/history`
- `/system-status`
- Gateway ingestion endpoints
- WebSocket endpoints

## Database

**DATABASE TECHNOLOGY NOT SPECIFIED.**

No database dependency, connection configuration, tables, schemas, repositories, migrations, retention policy, indexes, or persistence behavior has been created.

## Gateway and hardware ingestion

The Gateway-to-backend transport, authentication, packet format, serialization, validation, retry behavior, and ingestion endpoint are **NOT SPECIFIED**.

No LoRa or hardware integration has been implemented in this backend.

## Authentication and CORS

Authentication and authorization requirements are **NOT SPECIFIED**. No authentication has been added.

The current frontend does not integrate with this backend, so no CORS policy has been added. If cross-origin integration is later required, the allowed frontend origin must be explicitly confirmed before configuration.

## Implementation boundary

The backend may proceed only after the official documentation defines the missing entity and transport contracts. Until then:

- Do not create Pydantic domain schemas.
- Do not create ORM/database models.
- Do not create repositories or domain services.
- Do not create domain API routes.
- Do not create mock data.
- Do not infer hardware or telemetry fields.

