# RESQ8–RESQ9 authorization decisions for approval

Status: approval request only. This document does not approve policy and does
not authorize implementation or live ingestion.

## Context

RESQ8 has a persistent audit service and a preserved demo path. The detailed
contract evidence is recorded in
`docs/ingest/RESQ9_AUTH_INTEGRATION.md`. Five authorization decisions remain
blocked. Decision F is resolved: keep `INGEST_LIVE=false` for demo mode and
apply redesign authentication and scope enforcement only to the approved live
path.

No responsible person's name or formal approval authority was identified in
the repository. These decisions therefore require approval from the designated
RESQ project/product owner, with security/backend ownership included as needed.

## 1. Authentication dependency

### Approval question

Should RESQ8 live triage migrate to the RESQ9 redesign access-token dependency
(15-minute access token with `sub`, `role`, `typ=access`, expiry validation, and
CSRF protection for browser state changes), or should an explicitly specified
compatibility adapter be approved?

### Evidence and alternatives

- RESQ9 documents the redesign dependency and CSRF requirement.
- RESQ8 currently has a legacy 12-hour token path.

Alternatives:

1. **Migrate to redesign auth — recommendation, NOT APPROVED.** Gives one
   authoritative actor/role source and matches RESQ9. It requires replacing the
   live triage dependency, validating redesign claims, adding CSRF checks, and
   updating endpoint tests.
2. **Approved compatibility adapter — NOT APPROVED.** Could preserve a staged
   rollout, but requires an owner-defined token boundary, claim validation,
   expiry rules, role handling, and CSRF behavior. Legacy credentials must not
   silently become redesign credentials.

### Code/API and test dependencies (verified)

- RESQ8 surfaces: `backend/app/core/security.py` (`current_user`,
  `optional_current_user`) and `backend/app/routers/redesign.py`
  (`act_on_detection`, currently guarded by `_live_authorization_not_ready`).
- RESQ9 reference API: `backend/app/core/security.py`
  (`current_redesign_user`, `require_csrf`, `require_roles`) and
  `backend/app/routers/redesign.py`.
- Existing tests: RESQ8 `backend/tests/test_ingest.py` covers live-path 503 and
  demo behavior; RESQ9 `backend/tests/test_auth.py` covers token/login/CSRF.
  After approval, extend these suites for the selected live triage credential
  path and its missing, malformed, expired, and valid-token cases.

Owner decision: `______________________________________________`

## 2. Legacy `officer` role

### Approval question

Should legacy `officer` be removed from live triage, explicitly mapped to a
named RESQ9 role, or handled under another documented policy?

### Evidence and alternatives

- RESQ9's approved triage row permits `admin` and
  `control_room_operator`, subject to scope.
- No authoritative mapping from legacy `officer` to a redesign role was found.

Alternatives:

1. **Remove `officer` from live triage — recommendation, NOT APPROVED.**
   Prevents accidental privilege expansion and follows the exact RESQ9 role
   matrix. Existing legacy accounts would need migration or explicit denial.
2. **Map `officer` to a named redesign role — NOT APPROVED.** Preserves
   compatibility, but changes authority and must specify the exact target role,
   scope behavior, token representation, and migration/audit rules.
3. **Other policy — NOT APPROVED.** Requires a written role rule; no implicit
   mapping is permitted.

### Code/API and test dependencies (verified)

- RESQ8 surfaces: `backend/app/core/security.py` (`require_write`) and
  `backend/app/routers/redesign.py` (`act_on_detection`); the action request
  also currently contains a client `role` field, which must not become trusted
  authority.
- RESQ9 reference: `backend/app/core/security.py` (`require_roles`) and
  `backend/app/routers/redesign.py`'s `control_room_operator` triage dependency.
- Existing tests: RESQ8 `backend/tests/test_ingest.py` covers the live 503
  boundary; RESQ9 `backend/tests/test_auth.py` contains
  `PermissionMatrixTests.test_only_control_room_operator_can_act_on_detections`
  and `LoginTests.test_legacy_role_cannot_use_redesign_login`. After approval,
  add explicit RESQ8 cases for the approved legacy-role outcome and prove a
  request-body role cannot grant permission.

Owner decision and, if applicable, target role: `___________________________`

## 3. Authoritative resource state

### Approval question

Should scope authorization resolve state from the persisted detection record or
its linked candidate record, and what must happen when the selected record or
its state is missing?

### Evidence and alternatives

- RESQ9 requires trusted persisted resource state and forbids request-supplied
  authorization evidence.
- Existing evidence does not define detection-versus-candidate precedence or a
  missing-state fallback.

Alternatives:

1. **Detection state first, explicit candidate fallback — NOT APPROVED.**
   Fits the RESQ8 live detection schema but requires rules for disagreement and
   candidate absence.
2. **Candidate state as authority — NOT APPROVED.** May better represent
   incident ownership but requires every detection to resolve to a candidate.
3. **Default-deny on missing or ambiguous state — recommendation, NOT APPROVED.**
   Prevents cross-scope access and avoids authorizing unverifiable resources;
   it must specify the response and audit event.

### Code/API and test dependencies (verified)

- RESQ8 data/route surfaces: `backend/app/database/session.py` defines state
  on detections and candidates; `backend/app/services/ingest.py` assigns and
  processes those states; `backend/app/routers/redesign.py` shapes live
  detections but currently returns 503 before querying them.
- RESQ9 reference: `backend/app/routers/redesign.py` resolves demo detection
  state through `_detection_state`; `backend/app/core/permissions.py`
  (`require_scope`) enforces state scope. Neither settles RESQ8's
  detection-versus-candidate authority or missing/disagreement rule.
- Existing tests: RESQ8 `backend/tests/test_ingest.py` covers fail-closed live
  routes, and `backend/tests/test_ingest_postgis_integration.py` exercises
  persisted candidate/detection processing. RESQ9 `backend/tests/test_auth.py`
  includes `ScopeTests`. After approval, add route-level cases for the chosen
  persisted source, absent resource/state, disagreement, and spoofed
  request-supplied state.

Owner decision, including missing/disagreement behavior: `___________________`

## 4. Complete audit history interface

### Approval question

Should RESQ8 use a formally supported shared `get_all_actions` API, or may it
query the shared `resq_audit_log` table directly in chronological order using
audit-row ID as the deterministic tie-breaker?

### Evidence and alternatives

- RESQ9's published audit interface specifies latest-action functions.
- RESQ8 requires complete chronological history; no approved full-history API
  was found.

Alternatives:

1. **Publish and use `get_all_actions` — recommendation, NOT APPROVED.**
   Gives a stable boundary and allows schema/query ownership to remain with the
   audit service. It requires the API signature, ordering, and error behavior to
   be approved.
2. **Direct shared-table query — NOT APPROVED.** Minimizes interface work in
   the same backend but couples RESQ8 to table schema and index details. It
   requires explicit permission and a schema-ownership rule.

### Code/API and test dependencies (verified)

- RESQ8 surface: `backend/app/services/audit_log.py` exposes
  `get_all_actions`; `backend/app/routers/redesign.py`'s
  `detection_history` does not call it because the live route is guarded.
- RESQ9 published interface: `backend/app/services/audit_log.py` and
  `docs/product/AUDIT_LOG.md` expose `write_audit_log`, `get_latest_action`,
  and `get_latest_actions`; no `get_all_actions` API is documented or present.
- Existing tests: RESQ8 `backend/tests/test_audit_log.py` checks chronological
  persistence; RESQ9 `backend/tests/test_auth.py` checks latest-action reads.
  The selected option requires a corresponding ordering/tie-break test at the
  shared service boundary (or a direct-query test if that option is approved).

Owner decision: `______________________________________________`

## 5. Failure while auditing an authorization denial

### Approval question

If recording an out-of-scope denial fails, should the endpoint return a server
error instead of the intended 403, or follow another explicitly approved
fail-closed response policy?

### Evidence and alternatives

- RESQ9 requires that audit failure never produce a successful action response.
- The external HTTP status for a denial-audit failure is unspecified.

Alternatives:

1. **Propagate the audit/database failure — recommendation, NOT APPROVED.**
   Makes audit unavailability visible and avoids claiming that the denial was
   recorded. The exact externally visible status and safe error body still need
   approval.
2. **Return the intended 403 while separately surfacing audit failure — NOT
   APPROVED.** Preserves the authorization result but risks hiding an audit
   integrity failure and requires a reliable secondary channel.
3. **Other fail-closed response — NOT APPROVED.** Must specify status, body,
   logging, retry, and whether access remains denied.

### Code/API and test dependencies (verified)

- RESQ9 implementation: `backend/app/core/permissions.py` (`require_scope`)
  calls `backend/app/services/audit_log.py` (`write_audit_log`) before raising
  the scope-denial 403. The externally visible behavior if that write raises
  is not separately specified by the approval contract.
- Existing tests: RESQ9 `backend/tests/test_auth.py` contains
  `ScopeTests.test_out_of_scope_detection_is_403_and_audited`; RESQ8
  `backend/tests/test_audit_log.py` checks generic audit database-error
  propagation. After approval, add an endpoint-level injected audit failure
  test asserting the approved response and that no protected side effect or
  success response occurs.

Owner decision and external behavior: `_______________________________`

## Implementation and runtime acceptance checklist

After all five decisions are approved:

- [ ] Record the approved decisions and contract version in the integration doc.
- [ ] Implement only the approved authentication/token and CSRF boundary.
- [ ] Enforce the exact approved role matrix; do not trust body role fields.
- [ ] Resolve resource state from the approved persisted source and apply the
      approved missing-state rule.
- [ ] Enforce admin bypass and non-admin default-deny state scopes.
- [ ] Complete authentication, role, and scope checks before mutations or
      success-audit writes.
- [ ] Persist denial events with authenticated actor, entity, attempted state,
      role, and server timestamp; handle write failures per the approved rule.
- [ ] Persist triage events with correct `previous_state` and expose the
      approved chronological history interface.
- [ ] Prove demo behavior remains unchanged with `INGEST_LIVE=false`.
- [ ] Test missing, malformed, expired, and valid credentials; every approved
      role; scope allowed/denied/no-scope/admin bypass; missing resource/state;
      request-state spoofing; CSRF failure; denied side effects; audit-write
      failure; actor identity; previous state; restart persistence; and ordering.
- [ ] Run the dependency-complete backend suite and focused authorization tests.
- [ ] Obtain explicit production authorization before enabling live behavior.

Until approval and runtime verification are complete, RESQ8 is not production
authorization-ready.
