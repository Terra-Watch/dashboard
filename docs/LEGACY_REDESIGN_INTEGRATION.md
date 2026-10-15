# Legacy RESQ ↔ TerraWatch integration map

Status: source-level integration map, not a production-readiness claim. Routes
below are verified in this checkout; browser tests use API mocks and do not
verify database persistence or authorization against a running backend.

## Legacy workflows to retain until replacements are verified

| Workflow | Legacy UI | API dependencies | Notes |
|---|---|---|---|
| Historical risk map | `/app/map`: `frontend/src/pages/MapPage.tsx`, `RiskLayer.tsx`, `PriorityList.tsx`, `CellPanel.tsx` | `GET /api/risk/daily`, `GET /api/risk/geojson` | Daily records and geometry share `cell_id`; selection is held in the legacy map workspace. These endpoints require redesign access-token parsing and roles (`range_officer`, `control_room_operator`, `incident_commander`, or admin). |
| Submit a report | `/app/incidents/new`: `frontend/src/features/operations/IncidentsPage.tsx` | `POST /api/incidents` | Requires a selected state. `client_key` supports idempotency. Only network `TypeError` failures enter the local queue; HTTP failures remain errors. Queue sync is bound to the authenticated actor and retains drafts missing state. |
| Review/update reports | `/app/incidents`: `IncidentsListPage.tsx` | `GET /api/incidents`, `PATCH /api/incidents/{id}/status`; available but not currently consumed by this page: `GET /api/incidents/{id}/history` | The server owns permitted transitions, scope checks, and audit writes. Keep the per-report request lock and show success only after a successful PATCH. |
| Alerts | `/app/alerts`: `frontend/src/features/operations/AlertsPage.tsx` | `GET /api/alerts`, `PATCH /api/alerts/{id}/read`, `/acknowledge`, `/resolve` | Mutations require a successful response; errors leave the displayed alert state unchanged. Alert reads and mutations are scoped server-side. |
| Alert preferences | `/app/alerts/rules` | `GET/POST /api/alerts/rules` | Authenticated API; write route uses the backend write dependency. |

## Redesign API dependencies visible in this checkout

The redesigned landing is the canonical public `/` experience (the URL is
replaced with `/redesign`); redesign routes are rendered by
`frontend/src/app/App.tsx` through `frontend/src/redesign/RedesignRoot.tsx`.
Its server APIs are under
`/api/redesign`:

- `GET /detections`, `GET /detections/{id}/history`, and
  `GET /incidents/{id}/scenario` supply triage and incident context.
- `POST /detections/{id}/actions` is a state-changing route with CSRF
  protection. Its live path remains fail-closed while authorization decisions
  are unresolved.
- `GET /replay` and `GET /replay/{incident_id}` provide saved research replay
  data; these are not live fire forecasts.
- `GET /field/tasks`, `POST /field/reports`, and `GET /field/reports` support
  task/report workflows. The write is idempotency-keyed and CSRF-protected.

Do not remove the legacy route shell until every replacement has an agreed
route, API, and permission contract and its behavior is verified. Current
shared integration files include `frontend/src/app/App.tsx`,
`frontend/src/styles.css`, `frontend/src/ui.css`, and
`frontend/tests/smoke.spec.ts`; current redesign-owned paths are under
`frontend/src/redesign/`. These files already contain uncommitted changes.

## Authentication and authorization boundary

- Legacy sign-in (`POST /api/auth/login`) issues a 12-hour token without a
  `typ` claim. `make_token` and redesign access tokens both use HS256 and the
  configured `RESQ_SECRET_KEY`; both require an `exp` claim when validated.
  Neither token format currently configures issuer or audience claims/checks.
  Legacy `current_user` validates the untyped format; `require_write` permits
  only the existing `admin` and `officer` roles.
- Redesign sign-in (`POST /api/auth/redesign/login`) issues a 15-minute
  `typ=access` token and refresh/CSRF credentials. Redesign dependencies use
  the five-role vocabulary in `backend/app/core/security.py` and enforce CSRF
  on state-changing browser routes.
- The legacy map calls read-only risk endpoints. Those endpoints now use the
  narrowly scoped `current_risk_user` / `require_risk_roles` adapter: it accepts
  cryptographically verified, unexpired legacy or redesign access tokens,
  then applies the unchanged risk-role gate. This makes legacy `admin` work on
  risk reads without granting new permissions. The code is implemented but
  runtime verification is blocked because PyJWT is unavailable in the local
  Python environments. It does not adapt or authorize legacy `officer`; that
  token authenticates but fails risk-role authorization with 403. No
  client-supplied role is used.
- This is not a general token migration: other redesign endpoints continue to
  require `typ=access`, and legacy `current_user` and `require_write` retain
  their existing behavior. The `admin` identity has the same existing admin
  privileges in both role systems. No mapping from `officer` to
  `range_officer` (or another redesign role) is established in the source; an
  owner must decide that mapping before staff officers can use scoped risk
  reads through legacy login.
- Client-side route visibility is only a usability affordance. Backend
  `current_user`, `require_write`, `require_roles`, and `require_scope` remain
  the security boundary. The `/api/redesign` live-write 503 guard must remain
  until the applicable policy is approved and implemented.

### Authentication compatibility tests

`backend/tests/test_risk_auth_compat.py` covers acceptance of a valid legacy
admin token and a valid redesign access token; rejection of an invalid
signature, expired token, and non-access typed token; and a 403 for a valid
legacy `officer` token that has no approved risk-role mapping. In the
repository's documented `backend/.venv` (Python 3.14.7, PyJWT 2.15.1 already
present), `backend/.venv/bin/python -m unittest
backend.tests.test_risk_auth_compat -v` passed 6 tests. The same environment
passed `backend.tests.test_security_config` (9 tests),
`backend.tests.test_risk_filter` (6 tests), and
`backend.tests.test_redesign_write_guards` (3 tests). These focused tests do
not connect to the database; they verify token parsing, role gating, risk
filtering, and unauthenticated write guards. They do not establish
database-backed scope behavior or every authenticated CSRF/scope path.

## Offline incident submission

`frontend/src/lib/offlineQueue.ts` stores queued report payloads with their
state and an owner ID derived from the token subject for local partitioning.
That local owner field is not authorization evidence; the server authenticates
the request independently. `syncPendingIncidents` retains entries without a
state, entries for another/unbound account, and failed submissions. The
incidents POST is idempotent by `client_key`, which protects against repeated
sync requests creating a second logical incident. Browser tests cover local
queue behavior with mocked APIs; server idempotency and transaction behavior
require backend integration tests against an isolated database.

## Image evidence assessment

No image upload endpoint or image-assessment service/model was found in the
current backend. The field-report request contains an optional `photo_name`,
and persistence stores that name only; this does not upload, inspect, dedupe,
or assess image bytes. Therefore assessment status is **unavailable**, not
pending or successful. Do not present fire/smoke detection, synthetic-image
detection, manipulation analysis, duplicate detection, or human review as
operational. A future integration needs an owned upload/storage contract and
an actual assessment-service contract before UI result states are implemented.
Report submission status must remain separate from any future assessment
status; assessment output must not automatically reject reports or change
incident lifecycle state.

## Legacy UI retirement candidates

`/app/brief`, `/app/plan`, `/app/alerts`, `/app/incidents`, `/app/settings`,
and `/app/map` are legacy operational experiences. Some have corresponding
redesign surfaces, but their backend routes, report queue, saved historical
map data, and security contracts are still dependencies. Treat the old UI as
a retirement candidate only after replacement workflows cover these APIs and
their failure/security behavior. Keep backend operations and audit services
even if their legacy page is eventually removed.

## Verification boundaries

The current browser suites mock API responses. They verify client state and
interaction handling only—not server role/scope enforcement, audit durability,
database idempotency, or live-data availability. Do not infer those properties
from frontend tests or saved demo data.
