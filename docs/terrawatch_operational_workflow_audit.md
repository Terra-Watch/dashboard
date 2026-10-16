# TerraWatch operational workflow audit

Status: implementation audit for the Ranger/Control Room milestone. This
document describes the current repository contract; it is not a claim that
the unsupported workflow is operational.

## Implemented today

- Staff authentication uses server-assigned roles and state scopes.
- Ranger routes are restricted to `field_crew` and use persisted
  `/api/ranger/assignments` and `/api/ranger/assignments/{id}/verification`
  records. Binary field evidence remains unavailable; the legacy sample-data
  field routes are preserved for compatibility but are not used by the new
  Ranger application.
- Shared incidents are persisted in `resq_incidents` and can be listed,
  scoped, inspected, and audited through `/api/incidents`.
- Incident creation is idempotent by `client_key`, starts at `reported`, and
  records an audit event.
- The validated incident state machine is:

  ```text
  reported -> verified | closed
  verified -> responding | contained | closed
  responding -> contained | closed
  contained -> responding | closed
  closed -> terminal
  ```

- Private image evidence is hash-addressed, MIME-validated, integrity-checked,
  scope-protected, and assessment failures remain `UNAVAILABLE`.
- Control Room roles (`control_room_operator`, `incident_commander`, and
  `admin`) can use the distinct `/control-room` frontend queue and detail
  views. State changes still pass through the server transition allowlist and
  scope check.
- Historical `/redesign/today` and `/app/admin` destinations remain intact.

## Missing backend capabilities

The repository does not yet contain:

- Team dispatch, reassignment, acceptance, or due-time APIs. The current
  assignment contract supports one active Ranger assignment per incident.
- Ranger-owned assignment history beyond persisted verification events.
- Binary evidence upload from `field_crew`.
- Email, push, or SMS notification delivery; current notifications are
  in-app alert rows only.

The frontend therefore does not claim that a Citizen report, assignment,
field upload, or notification occurred when no supporting API exists.

The Citizen report and assignment/verification APIs are now implemented in
`backend/app/routers/citizen.py` and `backend/app/routers/workflow.py`.
Citizen reports reuse the canonical incident table with authenticated
`reporter_id` ownership; evidence uses the existing private image table and
hash-addressed storage. Ranger verification is persisted against a server
created assignment and cannot be submitted for another Ranger's assignment.

## Current route and permission mapping

| Experience | Route | Server authorization | Current destination/behavior |
|---|---|---|---|
| Citizen | `/citizen/*` | Authenticated `citizen` | Protected fail-closed at `/citizen/login`; report ownership is enforced server-side |
| Ranger | `/ranger/*` | `field_crew` | Shared `/staff/login`; server-authorized field crew enters Ranger |
| Control Room | `/control-room/*` | `control_room_operator`, `incident_commander`, `admin` | Shared staff auth; queue uses scoped `/api/incidents` |
| Historical workspace | `/redesign/today` | Public saved example; API reads are role-scoped | Preserved as a clearly labelled historical example |
| Administration | `/app/admin` | `admin` | Existing read-only admin overview preserved |

The existing login router still sends `control_room_operator` and
`incident_commander` to `/redesign/today`, and `admin` to `/app/admin`, as
required by the established contract. Authenticated Control Room users can
open the operational queue from the new Control Room link. Citizen
registration and login use separate endpoints and never enter the staff role
allowlist.

## AI readiness

Production image assessment remains fail-closed. The available checkpoint is
not a verified TerraWatch `ModelArtifact`: the packaged `artifact.json`,
`arrays.npz`, calibration identity, base initialization provenance,
authenticity-head metadata, OOD state, and independent evaluation are not all
available. The website adapter consequently reports `UNAVAILABLE` rather
than loading the research checkpoint directly.

The precise blockers and assessor packaging issue are recorded in
`docs/fire_evidence_phase3_readiness.md` and the artifact contract. No model
artifact was generated and no inference was started for this milestone.

## Safe next contracts

The next backend design must define and test:

1. A report-to-incident relationship and duplicate/related-report rules.
2. Team dispatch, reassignment, acceptance, and due-time semantics.
3. A unified field-report/evidence store linked to the assigned incident.
4. Versioned incident transitions to prevent stale operator updates.
5. Notification recipients and delivery state.
6. A verified, packaged, independently evaluated image-assessment artifact.
