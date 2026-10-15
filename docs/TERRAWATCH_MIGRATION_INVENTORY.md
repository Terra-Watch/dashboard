# TerraWatch migration and remaining-work inventory

Status checked 2026-10-15 in the nested `website` checkout (`redesign-v2`,
`a2bebb8`). The outer RESQ repository and this checkout were already dirty;
all existing changes and untracked files have been preserved. This document is
an evidence-based work inventory, not authorization to enable operational
features or remove legacy code.

## Current product surfaces

- `frontend/src/main.tsx` loads one React entry and `frontend/src/app/App.tsx`
  selects among public pages, legacy `/app/*`, the transitional `/redesign/*`
  shell, and the read-only `/demo` archive. Thus there is one code entry but
  still multiple user experiences and route families.
- Legacy `/app/*` contains map, brief, plans, alerts/rules, incidents, spread,
  assistant, settings, notifications, reports, and admin. Several of these
  call persistence-backed operations using legacy authentication.
- `/redesign/*` contains historical ranking, reports-to-review, possible
  spread, and field-example screens. It reads sample data. Persistent triage,
  report writes, and history remain guarded with HTTP 503. Its field notes are
  saved locally and are not uploaded.
- `/demo` is the canonical public historical example. It reads bundled
  information and the local basemap without requesting live fire data. The
  detailed scientific identifiers and provenance remain in the saved research
  records and a collapsed source/method section, not ordinary page labels.
- The frontend has `npm run build` and `npm run test:unit`; browser tests are in
  `frontend/tests`. Some existing browser tests capture screenshots into
  tracked documentation paths, so broad screenshot runs must be reviewed
  before execution to avoid replacing user evidence.
- Legacy auth (`backend/app/core/security.py`) is still a 12-hour HS256 token
  with `admin`/`officer` roles. Its known development-key fallback has been
  removed; sign-in and authenticated requests now return unavailable until
  `RESQ_SECRET_KEY` is explicitly configured with at least 32 UTF-8 bytes.
  This removes a forgeable default but does not resolve the auth contract or
  make these credentials production-ready. The redesign authorization
  decisions A–E remain unresolved in the
  separate RESQ8 worktree's integration record. Do not infer that legacy roles
  or client previews satisfy TerraWatch's intended user access policy.
- `backend/app/routers/redesign.py` returns sample detections/scenarios, while
  triage, field-report persistence, and history are fail-closed. The legacy
  operations router still exposes additional database-backed actions; they
  need independent authorization review before operational use. The legacy
  spread-job route is now fail-closed because its runner reuses and deletes
  shared output paths; the map can only toggle the already-saved example, and
  the separate spread screen links to the public saved example instead of
  submitting a new run.
- The current main checkout has RESQ6 research materials under
  `docs/sim_diagnosis/`, `scripts/resq6/`, and bundled historical maps. The
  detailed simulation protocol/results are maintained in the separate RESQ6
  worktree, not this checkout. This inventory does not access held-out data.

## Remaining work, ordered by priority

Each row includes the need, dependency, safe-now assessment, verification, and
completion condition. “Blocked” means an owner contract or external setup is
required; independent work should continue where possible.

| Priority / status | Remaining task and why it is needed | Dependencies / safe now | Required tests | Completion criteria |
|---|---|---|---|---|
| **P0 — Blocked** | Approve and implement one server-verified identity/session contract, secret handling, role vocabulary, state/resource scope, CSRF/session behavior, and audit-failure behavior. Current legacy auth stores a long-lived token in browser local storage and accepts legacy roles; those do not establish the required three user classes or state scopes. | Owner decisions A–E in `docs/ingest/RESQ9_AUTH_INTEGRATION.md`; identity-provider configuration and production secret management. Do not guess or enable writes meanwhile. | Missing/expired/forged identity; each approved role; allowed/denied state; client-forged actor/role/state; CSRF; denial audit; audit write failure; persistence and restart tests. | One approved contract enforced server-side across every protected route; no unsafe write/history path remains reachable; required runtime tests pass. |
| **P0 — Blocked** | Review and gate every legacy persistence-backed operations route, not just redesign routes. Legacy incidents/status, alerts/rules, plans, settings, spread jobs, admin and reports have different access behavior. | Approved auth/scope contract and route-by-route disposition. A read-only code review can continue; policy changes cannot be inferred. | Endpoint authorization and scope matrix; forbidden requests cause no side effects; audit and transaction tests. | Every route has an approved access rule, tests, and consistent denial/error behavior; unsafe routes remain unavailable until then. |
| **P1 — Blocked** | Establish one canonical application shell and promote only verified replacement routes. `/app/*` and `/redesign/*` are both live route families; the redesign does not replace unique legacy plans, rules, settings, administration, reports, or incident workflows. | P0 auth contract plus workflow and API mapping. Route inventory is reversible; deleting/moving route implementations is not safe yet. | Direct navigation, refresh, deep links, redirects, legacy-feature parity, role-specific browser tests. | One canonical shell and stable public routes; each retained feature has a tested equivalent or an explicit owner-approved retirement; transitional URLs redirect. |
| **P1 — Blocked** | Complete the three intended user experiences without suggesting unsupported capabilities: Range Officer local monitoring/field notes, Control Room regional review/briefing, and Citizen public information/reporting. Current pages are sample or legacy surfaces, not verified workflows. | P0 identity/role/scope contract; verified service and report-retention contracts. | Separate route/data authorization tests for each user class; report ownership; unverified submissions remain unconfirmed; offline queue status. | Each enabled action is backed by the approved server contract and end-to-end tested; unsupported actions are explicitly unavailable. |
| **P1 — Blocked** | Configure production identity, email/reset, database, allowed origins, secrets, and deployment health checks. The known signing-key fallback has been removed; authentication now fails closed when `RESQ_SECRET_KEY` is missing or shorter than 32 UTF-8 bytes. Account recovery still lacks a configured provider/email service. | Owner-provided identity provider, high-entropy secret provisioning, database/deployment environment. No secrets or provider configuration may be invented. | Missing/short-key sign-in/auth checks; production-config startup and recovery tests; health/readiness and origin/session checks. | Authentication and recovery work through approved identity infrastructure; no development credential fallback; target deployment configuration is verified. |
| **P1 — In progress** | Finish user-language audit across legacy and transitional pages, including error/empty/loading states, accessibility text, and authenticated pages. Recent pass rewrote public home, login, maps, archive, and several redesign screens; the visible-copy browser check now covers primary guest routes. Remaining lower-level and authenticated routes still need review. | No policy dependency for copy. Preserve source names only in clearly labeled methodology/source information; leave code identifiers/provenance intact. | Plain-language visible-copy test on primary routes; page-specific browser and accessibility checks; verify source details remain available. | Every reachable user screen is checked at desktop/mobile; no unexplained implementation labels, internal IDs, paths, raw technical errors, or misleading control labels remain. |
| **P1 — Partial** | Complete API contract and client error handling. Current redesign reads sample endpoints; writes/history return 503. Some legacy screens still depend on persistence routes; user-facing wrappers now suppress raw server details, but direct-fetch paths and all route payloads are not comprehensively covered. | P0 authorization and stable endpoint ownership. Safe to normalize generic error copy; do not change server policy. | Contract tests per route; malformed/unavailable responses; no raw server exception details in rendered UI. | Documented request/response/error contract with auth/scope behavior and route-level tests for all clients. |
| **P2 — In progress** | Keep `/demo` offline, historical, scientifically honest, and free of ordinary developer language. Recent UI copy no longer exposes project/model/runtime names in its main narrative; its saved provenance retains exact source identifiers. | Existing bundled data only. Avoid regenerating or modifying research data unless explicitly authorized. | Browser test blocks API/external calls; verify local maps, dates, completeness caveat, no calibration claim, source disclosure, and mobile layout. | Demo works with network disabled, labels historical vs observed vs modeled information accurately, and passes plain-language and provenance checks. |
| **P2 — Blocked** | Complete simulation implementation/validation assessment before exposing operational spread forecasts. Current `/app/spread` and saved examples use fixed historical wind and simplified vegetation; archived runs are not operational forecasts. The RESQ6 development gate has been reported failed; held-out evaluation remains prohibited. The proposed wind-elongated ellipse must not be claimed as shipped unless verified in the relevant implementation. | Frozen RESQ6 protocol, separate authorized research worktree, approved experiment scope; do not inspect held-out data or change thresholds/labels. | Only authorized development-set regressions/experiments; physical input/orientation checks; reproducibility and provenance. | Independent development acceptance criteria are met and authorized; results remain separate from product claims; operational validation and source limitations are explicit. |
| **P2 — In progress** | Verify browser navigation, refresh, accessibility, responsive/mobile behavior, offline behavior, and current regression tests after copy changes. Existing Playwright suite includes map rendering tests; some tests write screenshot files and must not overwrite existing evidence unnoticed. | Existing installed frontend dependencies and controlled server configuration. | Targeted Playwright tests, Axe checks, route-refresh checks, PWA/offline test, frontend build/unit suite. | Exact current test run passes without replacing historical screenshot artifacts; remaining skips/failures are explained. |
| **P3 — Partial** | Remove the now-unused styleguide source, redesign implementation terminology in developer-only source, unused imports/components, and obsolete aliases only after route migration. The stale `/redesign/styleguide` URL now redirects to the redesign home; the source page remains unreferenced but undeleted. | P1 canonical route migration and usage evidence. | TypeScript build, import/reference scan, route and consumer tests. | No obsolete user routes/imports remain and deletion has no references or regressions. |

## Scientific and operational boundaries

- Historical ranking is a relative ordering, not a calibrated fire probability
  or current forecast. Coverage is incomplete.
- Satellite active-fire observations are incomplete evidence, not full physical
  perimeters; no observation does not establish an unburned area.
- Saved possible-spread examples are conditional on a prescribed starting
  point and archived inputs. They are separate from the historical ranking and
  are not operational forecasts.
- The RESQ6 development result did not meet its frozen acceptance gate. Do not
  access the held-out set, retune against it, or represent the model as
  operationally validated.
- No live ingestion, dispatch, emergency-service integration, persistent
  redesign triage/history, or authorized citizen report service is established
  by this checkout.

## This pass

 Updated visible language in public/archive, redesign, and selected legacy map,
 brief, alert, incident, plan, and error states. The legacy spread route now
 returns unavailable without invoking the shared-output runner; its UI only
 links to saved historical material. Added a browser regression test that
 asserts the spread page submits no new run, plus scans for known developer
terminology and redirects the retired styleguide URL. Removed the predictable
legacy JWT signing-key fallback; without an explicitly configured key of at
least 32 UTF-8 bytes, token issuance and authenticated requests fail closed
(requests without credentials continue to receive 401). The legacy alert-type
selector now filters the returned alert records instead of doing nothing;
saved rule copy now states that rules do not yet generate alerts, and the
briefing action is labeled as printing because it invokes the browser print
dialog rather than saving an application record.
No auth, role policy, persisted operation, database contract, scientific data,
or held-out evaluation was changed.

## Current integration verification snapshot — 2026-10-15

This snapshot records a later read-only review of the dirty worktree and
supersedes any earlier statement above that redesign triage, history, and
field-report routes are currently guarded by unconditional HTTP 503 responses.
The inspected source currently has authenticated triage, history, and
field-report handlers. `test_redesign_write_guards.py` returned **3 failures**
(observed 403/401 rather than the test's expected 503); the route implementation
changed during the review, so this is a snapshot, not a stable integration
approval. These endpoints still lack approved RESQ8/RESQ9 decisions and must
not be treated as operationally authorized.

Specific remaining evidence from that review:

- Triage resolves state from the redesign sample-detection list, skips scope
  enforcement when state is missing, commits its SQLite store write before a
  separate persistent audit write, and does not record `previous_state`.
- Field-report persistence is enabled in the inspected source but is not bound
  to an approved task/resource scope. Field-task listing has no per-user state
  filter. Neither behavior establishes resource ownership.
- Incident creation currently suppresses audit/alert processing exceptions
  after the incident transaction commits. Status changes also commit before
  separate audit writes. Audit consistency is therefore not verified.
- Incident and alert list paths apply scope predicates only when a non-admin
  user has at least one scope; empty-scope default-deny is not established.
  Single-resource paths also skip scope checks for missing state.
- Alert-rule `conditions` have no established condition schema in the inspected
  docs. Current evaluation filters enabled rules by kind but does not evaluate
  their conditions/state. Do not invent condition semantics or claim automatic
  matching is complete.
- Alert deduplication now takes a PostgreSQL transaction-scoped advisory lock
  before its read/insert sequence. Mocked ordering tests pass, but real
  PostgreSQL concurrency has not been exercised.

No PostgreSQL-backed test was run in this pass: the configured default points
to the `website-db-1` container's named persistent volume, and the effective
application `DATABASE_URL` override and database ownership were not
established. See the pass report for exact test commands and results.

## Continuation verification — 2026-10-15

The previously orphaned pure FIRMS test import now resolves to
`backend/app/services/ingest.py`. That module provides offline CSV parsing,
timestamp/coordinate checks, deterministic batch normalization and
deduplication, in-memory clustering, bounded fetch retry helpers, and a
conservative health default (`live: false`). It does **not** add a database
cycle, candidate persistence, audit integration, or enable live acquisition.
HTTP failures now remain failures: retryable statuses raise after bounded
exhaustion, and non-retryable statuses fail without retrying.

Incident creation now uses the existing partial unique `client_key` index as
an atomic insert-on-conflict idempotency boundary. A retry returns the prior
incident only to its original reporter; a colliding key owned by another
reporter returns 409 without disclosing the record. This SQL behavior was
covered with route-level test doubles, not a live PostgreSQL instance. The
redesign demo SQLite store also has a retry regression test preserving one
device-attributed field report; its HTTP persistence route remains disabled.

The redesign route matcher no longer captures similarly named `/redesigned`
paths, and `/redesign/demo` routes to the single `/demo` archive. A route
regression was added. The spread HTTP endpoint has an additional ASGI-level
test proving an authorized-shaped request receives 503 without invoking the
runner. The browser suite now stubs read-only sample APIs, checks current
user-facing scenario language and control behavior, and no longer posts to an
unrelated hard-coded API server. With screenshot output directed into
temporary test locations, the full suite passed 42/42. No production data or
simulation was run.

## Security, Incident Lifecycle, and Alert Stabilization — 2026-10-15

- **Scope & Authoritative State**: Geographic scopes in `resq_user_scopes` are enforced by `require_scope()` with default-deny behavior for non-admin callers. Requests targeting resources with missing authoritative state (`state IS NULL`) reject with HTTP 403 and log `out_of_division_access_denied`. If audit log write fails, requests fail closed with HTTP 500. Legacy `create_incident()` was updated to eliminate the scope-check bypass; all non-admin incident submissions now strictly enforce `require_scope(user, payload.state, ...)` (verified with unit tests in `test_incidents_alerts.py`).
- **Incident Lifecycle**: Incident status progression strictly enforces `PERMITTED_INCIDENT_TRANSITIONS` (`reported` -> `verified`/`closed`; `verified` -> `responding`/`contained`/`closed`; `responding` -> `contained`/`closed`; `contained` -> `responding`/`closed`; `closed` terminal). Illegal jumps reject with HTTP 422.
- **Transactional Audit Consistency**: `write_audit_log` accepts an active `connection=db` parameter. Incident creations, status transitions, and alert lifecycle changes commit atomically with their mandatory audit entries. If audit writing fails, the mutation rolls back.
- **Alert Generation & Condition Matching**: Stored rule conditions in `resq_alert_rules` (`state`, `min_size`, `size`, `sizes`, `source`) are strictly evaluated via `_matches_incident_conditions()` before alerts trigger. If a rule condition specifies `source` but the incident source is absent, the rule fails closed (does not trigger). Alert evaluation exceptions during incident creation and status progression are logged with `logger.error` rather than silently swallowed with bare `pass`.
- **Alert Deduplication & Scope on Alert Actions**: Sliding-window deduplication (15 minutes) with advisory transaction locks ensures concurrent safety. Deduplication keys include `rule_id` so distinct rules trigger independently, and ad-hoc alerts explicitly query `rule_id IS NULL`. Operational alert listing, acknowledgment, and resolution strictly enforce geographic scope, rejecting out-of-scope operations with HTTP 403.
- **Live Triage & Field Reports**: Live triage writes remain fail-closed with HTTP 503 via `_live_authorization_not_ready()` while decisions A–E remain pending. `submit_field_report` enforces `if INGEST_LIVE: _live_authorization_not_ready()`, validates that `task_id` exists in the detection queue (404 if missing), and confirms task-to-incident associations (422 if mismatched).
- **Verification Summary**: 116 backend tests passed (including PostgreSQL integration and mocked unit tests), 10 frontend unit tests passed, 55 isolated Playwright E2E tests passed, and production bundle built cleanly with zero errors. All dirty and untracked files were preserved, `INGEST_LIVE` remained unset, and the simulator was not executed.
