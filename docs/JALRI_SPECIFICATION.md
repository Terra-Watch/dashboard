# JALRI Project Specification

**Specification status:** Source documentation pending  
**Implementation status:** Documentation only  
**Source reviewed:** Phase 1 instruction brief provided for this task

## Source-of-truth statement

The official Jalri project documentation was not included in the material available for this phase. The available material defines how the specification must be documented, but does not define product capabilities, hardware, protocols, fields, roles, or workflows.

Accordingly, every undefined item below is explicitly marked **NOT SPECIFIED IN SOURCE DOCUMENTATION**. No product behavior, hardware capability, data field, API, protocol, or role is inferred from common maritime software patterns.

## 1. Product purpose

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

## 2. System architecture

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

The implementation repository currently has separate `frontend/`, `backend/`, and `docs/` directories from Phase 0. That repository layout is not evidence of the final Jalri product architecture.

## 3. BoatNode

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

The term “BoatNode” appears in the phase instructions as a possible system component, but no device definition, hardware, firmware behavior, identity, payload, or lifecycle is provided.

## 4. Gateway

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No gateway model, hardware, operating environment, connectivity, ingestion behavior, or responsibilities are defined.

## 5. LoRa-to-LoRa communication

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No supported communication relationship, topology, range, addressing, packet behavior, delivery guarantee, or retry behavior is defined.

## 6. LoRa network and protocol

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

The LoRa technology, network configuration, modulation settings, protocol, payload format, encryption, authentication, and message lifecycle are undefined.

## 7. Gateway-to-cloud communication

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

The transport, endpoint, authentication, message format, retry policy, buffering, and connectivity requirements are undefined.

## 8. Backend

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No backend responsibilities, service boundaries, API contract, WebSocket behavior, validation rules, or processing workflows are defined.

## 9. Database requirements

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No database engine, entities, relationships, retention policy, indexing strategy, time-series requirements, migrations, or data lifecycle is defined.

## 10. Dashboard

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No dashboard pages, views, metrics, filters, actions, permissions, or display requirements are defined.

## 11. Mobile/App features

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No mobile platform, application features, offline behavior, notifications, user flows, or mobile-specific permissions are defined.

## 12. Sensors

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No sensor types, measurements, units, sampling rates, calibration requirements, accuracy, or hardware mapping are defined.

## 13. AI/ML functionality

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No AI/ML purpose, input, output, model, training data, runtime location, confidence behavior, or implementation status is defined.

## 14. Maritime intelligence

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No maritime intelligence capability, data source, processing rule, output, or status is defined.

## 15. SAR functionality

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

Search and rescue behavior is not defined. Trigger, input, processing, output, dashboard usage, and responder usage are all unspecified.

## 16. Maritime boundaries and geofencing

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No boundary source, geometry, coordinate system, rule, event behavior, notification, or user action is defined.

## 17. Alerts and SOS

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No alert or SOS trigger, state model, severity, delivery method, acknowledgement behavior, escalation, or retention rule is defined.

## 18. Telemetry

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No telemetry fields, units, timestamps, source, frequency, validation, storage, display, or aggregation behavior is defined.

## 19. User roles

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No role names, permissions, dashboard access, or allowed actions are defined. No additional roles are inferred.

## 20. Authentication requirements

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No identity provider, authentication method, session behavior, authorization model, credential policy, or device authentication requirement is defined.

## 21. Data flow

The phase instructions provide an example flow, but do not establish it as the official product flow. Therefore the actual data flow is:

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No data movement can be documented between BoatNode, LoRa, gateway, cloud/backend, database, dashboard, or app without the official documentation.

## 22. Hardware and software responsibilities

### Hardware

No hardware components, purposes, devices, interfaces, sensors, or responsibilities are defined.

### Software layers

The responsibilities of BoatNode firmware, gateway firmware, backend, database, dashboard, mobile/app, and AI/ML are all:

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

## 23. Protocols

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No radio, transport, application, serialization, security, or synchronization protocol is defined.

## 24. Important constraints

The following documentation constraints are established by the Phase 1 instruction brief:

- The official project documentation is the source of truth once provided.
- Missing functionality and fields must not be invented.
- Undefined items must be marked “NOT SPECIFIED IN SOURCE DOCUMENTATION.”
- This phase is documentation-only.
- No database tables, API routes, frontend pages, UI components, mock data, backend services, or firmware are to be created in this phase.

Product and engineering constraints beyond those documentation rules are **NOT SPECIFIED IN SOURCE DOCUMENTATION**.

## 25. Planned but not implemented features

**NOT SPECIFIED IN SOURCE DOCUMENTATION.**

No feature may be classified as planned until the official project documentation defines it as planned.

## 26. Features with unclear specification

All requested product areas are currently unclear because the official documentation was not provided. Each requires source documentation before implementation:

- BoatNode and gateway behavior
- LoRa communication and network protocol
- Gateway-to-cloud communication
- Backend services and APIs
- Database requirements
- Dashboard and mobile/app behavior
- Sensors and telemetry
- AI/ML and maritime intelligence
- SAR
- Boundaries and geofencing
- Alerts and SOS
- User roles and authentication

## Canonical data contract

No canonical entities or fields can be defined from the available source material.

The following candidate entities were named in the Phase 1 instruction brief, but none are supported by actual project documentation yet:

| Entity | Field name | Data type | Meaning | Required/optional | Source | Used by |
|---|---|---|---|---|---|---|
| Boat | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION |
| Gateway | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION |
| Telemetry | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION |
| SOS Event | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION |
| Alert | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION |
| Location | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION |
| Event | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION |
| User | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION | NOT SPECIFIED IN SOURCE DOCUMENTATION |

These are placeholders for documentation tracking only, not data models or implementation contracts.

## Implementation status

| Feature | Specification | Status |
|---|---|---|
| Product purpose | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| System architecture | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| BoatNode | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Gateway | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| LoRa communication | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| LoRa protocol | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Gateway-to-cloud communication | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Backend | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Database | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Dashboard | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Mobile/App | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Sensors | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| AI/ML | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Maritime intelligence | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| SAR | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Boundaries/geofencing | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Alerts/SOS | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Telemetry | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| User roles | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |
| Authentication | NOT SPECIFIED IN SOURCE DOCUMENTATION | UNSPECIFIED |

No feature is marked `DEFINED`, `PLANNED`, `IMPLEMENTED`, or `PARTIALLY DEFINED` without supporting official documentation.

