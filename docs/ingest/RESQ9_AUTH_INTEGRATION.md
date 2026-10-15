# RESQ9 authorization contract for RESQ8

Status: contract discovery only. This file records the RESQ9 material inspected
from the separate `resq9/product-pass` worktree. It does not copy or integrate
RESQ9 implementation files.

## Authoritative references inspected

The following files were read from the RESQ9 worktree at
`/Users/kireeti/Desktop/Projects/RESQ/website/.claude/worktrees/agent-a283423718fcb5359`:

- `docs/product/00_plan.md` §1.2–§1.4 and §1.7: schema, role matrix, default-deny
  state scoping, and audit-event requirements.
- `backend/app/core/permissions.py`: executable `user_scopes()` and
  `require_scope()` behavior.
- `backend/app/core/security.py`: redesign access-token claims, role names, and
  CSRF requirement.
- `backend/app/routers/redesign.py`: endpoint-to-role/scope usage and the
  detection state lookup.
- `docs/product/PROGRESS.md`: implementation status and endpoint coverage.
- `docs/product/AUDIT_LOG.md`: shared `resq_audit_log` field and function
  interface.

These references establish a state-based scope contract, not a separate
division-table contract. “Division” in the product language currently maps to
the user's assigned state codes; no finer division/range mapping was found.

## Decision status

| Decision | Status | Evidence and consequence |
|---|---|---|
| A. Authentication dependency | **BLOCKED** | RESQ9 documents redesign access tokens, 15-minute expiry, and CSRF, while RESQ8 still has a legacy token path. No approved migration or compatibility adapter exists. RESQ8 must not accept legacy credentials as redesign credentials. |
| B. Role vocabulary/mapping | **BLOCKED** | RESQ9 permits `admin` and `control_room_operator` for triage. No authoritative mapping from RESQ8's legacy `officer` role exists. Do not treat `officer` as equivalent. |
| C. Resource-state source/fallback | **BLOCKED** | The policy requires trusted persisted state, and the RESQ9 implementation calls scope checks with a resource state, but no approved RESQ8 rule resolves detection-versus-candidate precedence or missing-state behavior. Do not authorize from request data or invent a fallback. |
| D. Complete history API | **BLOCKED** | `docs/product/AUDIT_LOG.md` specifies only latest-entry functions. RESQ8 needs complete chronological history; no approved `get_all_actions` interface or direct shared-table read contract was found. |
| E. Denial-audit failure status | **BLOCKED** | Fail-closed behavior is required and audit errors must not produce success, but the owner has not specified whether an audit failure replaces the intended 403 with a 5xx or uses another response. Do not invent an HTTP status. |
| F. Demo compatibility | **RESOLVED** | RESQ8's documented default is `INGEST_LIVE=false`, and its existing demo path uses SQLite sample data. The redesign auth/scope boundary must apply only to the live path; no live flag was enabled. |

Only F is resolved sufficiently for the existing implementation. The other
five decisions are authorization-boundary blockers and require an owner before
RESQ8 can implement the full RESQ9 policy.

## Contract RESQ8 must implement

### Identity and credentials

- Resolve the authenticated user server-side from the RESQ9 redesign access
  token; do not trust `role`, `user_id`, state, or scope values from the request
  body.
- The redesign token contains `sub` (integer user ID), `role`, `typ=access`, and
  a 15-minute expiry. The supported redesign roles are exactly:
  `range_officer`, `control_room_operator`, `field_crew`,
  `incident_commander`, and `admin`.
- State-changing browser requests also require the RESQ9 CSRF double-submit
  check. This applies to the live triage endpoint when using the redesign auth
  path.

### Scope data and authorization

- Scope storage is `resq_user_scopes(user_id, state)` with a composite primary
  key. The state is a two-letter code. The documented supported states are
  `OD`, `CG`, `TS`, `MP`, `MH`, and `JH`.
- `admin` bypasses scope checks.
- Every non-admin user is default-deny: no scope row means access to no
  state-scoped resource.
- A detection's authorization state must come from the persisted detection or
  candidate record, not from the request. RESQ9's current implementation uses
  the detection's state before calling `require_scope`.
- Detection triage is allowed for `admin` and
  `control_room_operator`, subject to state scope. Range officers, field crew,
  and incident commanders cannot perform triage actions.
- Detection listing is read access for admin, range officer,
  control-room operator, and incident commander, filtered to the caller's
  states for non-admin users.
- Detection history is read access for admin, range officer, control-room
  operator, and incident commander, subject to state scope.
- A role or scope denial is HTTP 403. A scope denial must not become a filtered
  empty success response for a single-resource request.
- Authorization must complete before any state mutation, audit success event,
  or other side effect. Out-of-scope attempts are themselves audited as
  `out_of_division_access_denied` with `entity_type`, `entity_id`, `user_id`,
  and metadata containing `attempted_state` and `role`.

### Persistent audit contract

The shared table is `resq_audit_log`:

```text
id, occurred_at, user_id, device_id, action, previous_state,
entity_type, entity_id, metadata
```

- `occurred_at` is server-generated; callers must not provide timestamps.
- `user_id` is the authenticated actor, not a body-supplied identity.
- `entity_type` for RESQ8 is `detection` or `candidate`.
- `entity_id` is always serialized as text.
- RESQ8 triage actions are exactly `verify`, `dismiss`, and `escalate`.
- `previous_state` is computed by the caller immediately before the action.
- Audit writes must be transactional and database errors must propagate as an
  explicit failure; the endpoint must not return success if the audit write
  fails.
- History must be read in chronological order, with a deterministic tie-break
  by audit row ID. It must survive process restart and contain actor identity,
  prior state, timestamp, and metadata for every event.

## Current incompatibilities requiring owner resolution

RESQ8 must not implement these by guessing:

1. **Token/auth dependency:** RESQ8 currently uses the legacy 12-hour token and
   `admin`/`officer` write policy. RESQ9 requires the redesign access token,
   five-role vocabulary, and CSRF protection. The owner must specify whether
   RESQ8 live triage migrates fully to the redesign auth dependency or whether a
   compatibility adapter is approved.
2. **Role vocabulary:** RESQ8's current live check allows legacy `officer`, while
   the authoritative redesign triage row allows only `control_room_operator`
   (plus admin). No mapping from `officer` to a redesign role is documented.
3. **Detection state source:** RESQ8's live detection schema has a `state`
   field, but the authoritative integration must confirm whether triage scope
   resolves from `resq_firms_detections.state` or from the linked candidate.
   The fallback when either is missing is not specified.
4. **History API:** `docs/product/AUDIT_LOG.md` specifies only
   `get_latest_action` and `get_latest_actions`; RESQ8 needs complete
   chronological history. RESQ9 must either publish a stable
   `get_all_actions` contract or explicitly approve RESQ8's direct shared-table
   chronological query.
5. **Denial-write failure:** `require_scope` writes the denial event before
   raising 403, but the contract does not state whether an audit database error
   should replace the intended 403 with a 5xx. The owner must choose fail-closed
   behavior and its externally visible status.
6. **Demo mode:** the product plan describes authenticated redesign endpoints,
   while RESQ8 explicitly preserves unauthenticated SQLite demo behavior when
   `INGEST_LIVE=false`. The owner must confirm that demo mode remains isolated
   and that the RESQ9 dependencies apply only when live mode is enabled.

Until these six decisions are resolved, RESQ8 cannot safely claim true
per-division/state authorization compatibility. No scope policy has been added
in this worktree.

## Integration checklist before production authorization

- [ ] Adopt the approved redesign auth dependency and token claims.
- [ ] Reject missing/expired/malformed identity before data lookup or mutation.
- [ ] Enforce the exact five-role matrix for every live endpoint.
- [ ] Resolve resource state from trusted persisted data.
- [ ] Enforce admin bypass and non-admin default-deny `resq_user_scopes`.
- [ ] Return 403 for role/scope denial; never use client role or state fields.
- [ ] Audit every out-of-scope denial with the required actor/entity metadata.
- [ ] Compute `previous_state` before the action and write the persistent audit
  event transactionally with the required fields.
- [ ] Return no success response when an audit write fails.
- [ ] Expose complete chronological history with deterministic ordering.
- [ ] Prove demo mode remains unchanged with `INGEST_LIVE=false`.
- [ ] Run endpoint tests for admin, each supported role, no scope, allowed
  scope, denied scope, malformed token, expired token, CSRF failure, and
  missing resource state.
- [ ] Run tests proving denied actions cause no triage mutation and that audit
  denial events persist across a process restart.
- [ ] Run tests proving audit-write failures do not produce success responses.
- [ ] Run the full backend test suite in the dependency-complete environment,
  then obtain explicit production authorization. No live ingestion is part of
  this checklist.
