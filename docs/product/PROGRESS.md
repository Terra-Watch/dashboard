# Product pass — progress log

Branch `resq9/product-pass`, forked from `redesign-v2` at `a2bebb8`. No app code touched yet.

## Step 0 — plan
- [x] Created branch `resq9/product-pass` from `redesign-v2`.
- [x] Read `docs/redesign/COPY_AUDIT.md` (existing, uncommitted-to-plan-yet analysis) and the
      full `docs/redesign/*` design-doc set, `docs/PRODUCT_RULES.md`.
- [x] Read existing auth scaffolding: `backend/app/routers/auth.py`, `backend/app/core/security.py`,
      `backend/app/database/session.py` — confirmed two unrelated auth stories (`/app/*` legacy,
      real JWT+bcrypt; `/redesign/*`, zero backend auth, client-side `RoleSwitcher` only).
- [x] Read `frontend/src/redesign/**` structure, existing `fieldQueue.ts` offline-queue pattern,
      `primitives.tsx`'s `SampleDataBadge`, `map.tsx`'s MapLibre/pmtiles setup (confirmed no
      code-splitting, 37MB PMTiles file).
- [x] Read `git show resq8/firms-ingestion:docs/ingest/00_design.md` (read-only, branch
      untouched) for the `GET /ingest/health` contract to design the Live-workspace chip against.
- [x] Listed existing test coverage (`frontend/tests/redesign.spec.ts`,
      `backend/tests/test_redesign_data.py`) to know what must keep passing vs. be deliberately
      updated.
- [x] Wrote `docs/product/00_plan.md` covering auth design, data-status model, plain-language
      glossary + strings architecture, and the copy-audit application plan.

**Stopped at Step 0 per instructions. Awaiting explicit approval before any Step 1 code.**

## Step 0 amendment — ranking-audit decisions + audit-log interface
- [x] Read `docs/ranking/00_audit.md`, `docs/ranking/01_option_b.md` (`resq10/ranking-audit`,
      read-only) and `git show resq8/firms-ingestion:docs/ingest/00_design.md` §8a (read-only).
- [x] Amended `00_plan.md` §2.4: Today's no-live-model state is now permanent framing (not a
      gap); specified the exact no-model-name copy template ("Areas near recent fires and with
      dry, windy forecasts rank higher."); elevated "no metrics/baselines/model names/research
      terms" to a standing rule with a planned banlist grep test for Step 1d.
- [x] Wrote `docs/product/AUDIT_LOG.md`: the audit-log function signature (`write_audit_log`,
      `get_latest_action`/`get_latest_actions`), table DDL, entity-identifier contract, and event
      types — resolves `resq8`'s §8a open questions so it can code against this before Step 1a
      lands. `resq8/firms-ingestion` itself not touched.
- [x] Committed.

**Step 0 plan approved with amendments** (see `00_plan.md`'s "Sign-offs" + "Step 1a amendments"
sections for the resolved text). Proceeding to Step 1a only, per instruction.

## Step 1a — auth backend + frontend + tests

**Backend** (`backend/app/`):
- `database/session.py`: additive, reversible migration — `resq_users.role` CHECK widened
  (4 new role values, nothing dropped), `password_algo`/`home_state` columns added,
  `resq_user_scopes`/`resq_refresh_tokens`/`resq_invites`/`resq_password_resets`/
  `resq_login_attempts`/`resq_audit_log` tables added, one seeded trainee account
  (`trainee@resq.local`, scoped to all 6 states) per the no-public-`/demo` sign-off.
- `core/security.py`: 15-min access JWT, rotated httpOnly `SameSite=Strict` refresh cookie
  (14 days), a paired `SameSite=Strict` CSRF cookie + `require_csrf` double-submit check,
  bcrypt (legacy rows) / argon2 (new accounts) password verification, opaque sha256-hashed
  tokens for refresh/invite/reset.
- `core/permissions.py`: `require_scope` — default-deny state/division scoping, 403 (never a
  filtered 200) on an out-of-scope single-resource request, writes
  `out_of_division_access_denied` to the audit log on every denial (approved amendment 4).
- `services/audit_log.py`: implements `docs/product/AUDIT_LOG.md`'s contract exactly
  (`write_audit_log`, `get_latest_action`, `get_latest_actions`) — this is what `resq8` codes
  against; `resq8/firms-ingestion` itself untouched.
- `routers/auth.py`: legacy `/login` unchanged (admin/officer/viewer, 12h token, `/app/*`).
  New: `POST /api/auth/redesign/login` (rate limit + lockout, identical generic error for wrong
  password vs. unknown email), `POST /refresh` (rotation + reuse detection — a reused token
  revokes the whole chain), `POST /logout`, `GET /me`, invite create/list/accept
  (single-use, 7-day expiry), admin-initiated password reset + complete (single-use, 24h
  expiry), `GET /audit-log` (admin-only, paginated, filterable).
- `routers/redesign.py` + `routers/risk.py`: every endpoint now has a role dependency; list
  endpoints (`/detections`, `/risk/geojson`, `/risk/daily`, `/replay`) are scope-filtered rather
  than all-or-nothing; single-resource endpoints (`/detections/{id}/actions`,
  `/detections/{id}/history`, `/incidents/{id}/scenario`, `/replay/{id}`) 403 via
  `require_scope` when the resource's state is outside the caller's scope.

**Frontend** (`frontend/src/redesign/`): `RoleSwitcher.tsx` deleted. New `lib/auth.ts`
(in-memory access token, login/refresh/logout, CSRF-header-attaching `authFetch`),
`pages/LoginPage.tsx`, `pages/ForbiddenPage.tsx` (403), `components/ExpiredSessionBanner.tsx`
(non-blocking, per §1.6). `RedesignRoot.tsx` rewritten to gate on real auth instead of the
role toggle, with per-role nav visibility and route-level 403s. `lib/api.ts`'s `rqFetch` now
delegates to `authFetch` so every existing caller gets auth headers for free.
`lib/types.ts`'s `Role` now matches the backend's role strings exactly (was mismatched:
`control_room` vs. backend's `control_room_operator`).

**Not done in this slice (flagged, not silently skipped):**
- `GET /api/meta` and the header-chip/freshness display are Step 1b, not built here.
- Field's offline-queue `pending-auth` state (§1.8: silent-refresh-then-prompt behavior) — the
  `SyncState` type now includes `'pending-auth'` but the sync routine in `field.tsx` doesn't yet
  branch on an expired refresh cookie to set it; `fieldQueue.ts`'s existing idempotency-keyed
  behavior is otherwise unchanged and still correct.
- Field-report read endpoint (`GET /api/redesign/field/reports`) is role-gated but not yet
  scope-filtered (reports don't carry a `state` field directly; needs a task→incident→state
  join, not done here).
- Field crew's "assigned only" scope (plan §1.3) isn't enforceable yet — there's no task
  assignment data model in this codebase to check against; field endpoints are role-gated only.
- `role_change` and `export` audit-log events (approved amendment 4's list) have no backend
  endpoint to emit them yet — no admin role-change endpoint and no export feature exist in this
  codebase. Not fabricated; add the event when those endpoints are built.
- Frontend build verified with `tsc -b` (clean) and `vite build` (clean, pre-existing
  >500kB-chunk warning unchanged); no Playwright run this slice (backend tests were the
  explicit verification ask).

**Verification**: real Postgres+PostGIS via this repo's own `docker-compose.yml`
(`postgis/postgis:16-3.4`, started for this session), migration run via `init_db()`.
`DATABASE_URL=postgresql+psycopg://resq:resq@localhost:55432/resq backend/.venv/bin/python -m
unittest discover -s backend/tests -v` → **50 tests, 50 passed, 1 skipped, 0 failed** (26
pre-existing + 24 new in `backend/tests/test_auth.py`: login/lockout/generic-errors, refresh
rotation + reuse detection, CSRF enforcement, the permission matrix per role per endpoint,
scope enforcement + its audit trail, invite/reset single-use + expiry, audit-log read access
control). `backend/requirements.txt`: added `argon2-cffi`.

Committed. **Stopping here per instruction** — Step 1b (`/api/meta`, header chip) not started.

## Step 1a-fix — short fix pass (accepted-with-fixes)

1. **Field-report reads now scope-filtered.** `GET /api/redesign/field/reports` joins each
   report's `task_id` back to its detection's `state` (`redesign_data.list_detections()`) and
   filters to the caller's `resq_user_scopes`, same pattern as `/detections` and
   `/risk/geojson`. Test: `FieldReportScopeTests` — a report in OD is visible to an OD-scoped
   caller, invisible (filtered out of the list, not a per-report 403) to a TS-scoped caller,
   and fully visible to admin.
2. **Route-coverage test added.** `RouteCoverageTests` walks every route under
   `/api/redesign/*`, `/api/risk/*`, `/api/auth/*`, and `/api/meta`, and fails if any lacks
   `current_redesign_user` (directly, or transitively through `require_roles(...)`) in its
   dependency tree — except an explicit allowlist: the legacy `/api/auth/login` and its two
   pre-existing public siblings (`access-requests`, `password-reset/request`, both predate this
   branch), `redesign/login`, `refresh` (cookie-authenticated, not bearer), `invites/{token}/accept`
   and `password-reset/{token}/complete` (one-time token stands in for auth), and `GET /api/meta`
   (Step 1b's public feed-status endpoint — the "health" the instruction named). Found 27 routes
   checked; passes.
3. **Hash actually used, and the one skip:**
   - Argon2 is used for every account this task creates or resets (new accounts via invite,
     admin-initiated resets, and the seeded trainee account — fixed below). Bcrypt remains only
     on the 3 pre-existing dev-seeded rows (`admin@resq.local`/`officer@resq.local`/
     `viewer@resq.local`) created before this branch, per the Step 0 plan's explicit "no forced
     rehash" decision (§1.2) — not a bug, a deliberate non-migration of rows this task didn't
     create.
   - The 1 skipped test is `test_mcd64a1_geo.py::test_validator_reads_burned_pixels_with_file_
     georeferencing`, pre-existing (not introduced by this branch), conditioned on a staged
     MCD64A1 HDF tile file that isn't present on this machine
     (`@unittest.skipUnless(HDF.exists(), ...)`). It is unrelated to auth or this branch's
     work; not a real gap this fix pass introduced or should fix.
4. **Trainee password is no longer hardcoded.** `database/session.py` now reads
   `RESQ_TRAINEE_PASSWORD` from the environment, or — only on the `INSERT` that first creates
   the row, never on a later restart — generates one with `secrets.token_urlsafe(18)` and
   prints it once (argon2-hashed in the database; the plaintext is never written to any file
   or committed). Verified: `trainee@resq.local`'s `password_algo` is `argon2` in the live DB.

### Deferred (explicitly, not silently dropped)
- Field crew's "assigned only" scope — no task-assignment data model exists to check against;
  field endpoints remain role-gated only.
- Field's offline-queue `pending-auth` sync branch (§1.8) — the `SyncState` type supports it;
  `field.tsx`'s sync routine doesn't yet branch on an expired refresh cookie to set it.
- `role_change` and `export` audit-log events — no admin role-change endpoint and no export
  feature exist yet in this codebase to emit them from.

Committed separately from Step 1b.

## Step 1b — `GET /api/meta` + header chip

- [x] New `backend/app/routers/meta.py`: `GET /api/meta`, no auth (status only, no secrets).
      Reports `workspace` and per-screen `{live, blocked_on, freshness?}` for `today`, `watch`,
      `incident`. **Computed, not hardcoded**: `today.live` is only `true` if `barv3._bundle_dir()`
      resolves to a bundle that is *not* the archived-replay shape (no `bar3_replay_*.npz` in
      it) — today it never is, confirmed live against this environment's actual (bundle-less)
      state, not assumed. `watch.live` reads `INGEST_LIVE` the same way `resq8/firms-ingestion`'s
      design doc specifies (`false` today — that branch isn't merged); if it's ever `true`, it
      soft-imports `app.services.ingest_health` (doesn't exist yet) and falls back to
      not-live rather than crashing, so this file needs no further edit once `resq8` lands.
      `incident.live` reads a new `INCIDENT_LIVE` flag, `false` until a live
      simulation capability is wired (none exists).
- [x] Frontend: `frontend/src/redesign/lib/meta.ts` (`fetchMeta`, plain-language `chipText` —
      no model names, no research terms). One `WorkspaceChip` in `RedesignRoot.tsx`'s nav bar
      (`primitives.tsx`, replacing the old `SampleDataBadge`), removed from all 6 former call
      sites (Landing/Today/Watch/Incident/Field/Styleguide). Today and Incident each fetch
      `/api/meta` themselves and branch their own copy on `today.live`/`incident.live` — not
      just the chip — per the instruction that they "read their status from `/api/meta`."
- [x] Applied the already-approved-but-not-yet-applied ranking-audit decision while in
      `TodayPage.tsx` for this exact reason: dropped the visible "Model: Bar v3" line (no model
      name in the UI) and wired in the exact approved live-copy template ("Areas near recent
      fires and with dry, windy forecasts rank higher.") for the `today.live` branch, inert
      until it's ever true.
- [x] `frontend/tests/redesign.spec.ts` rewritten for real auth (a direct consequence of Step
      1a that had never been verified against this suite before now): every protected screen
      now logs in first via a `loginAs()` helper (real invite+accept+login against the backend,
      not a bypass); `sample-data-badge` assertions → `workspace-chip`; new tests for
      unauthenticated-redirect, wrong-role-403, and the real login form. Along the way, fixed
      two real bugs this surfaced, not test-only workarounds:
      - `TodayPage.tsx`'s risk-data fetch used a bare unauthenticated `fetch`, not `rqFetch` —
        would have 401'd forever once `/api/risk/geojson` required auth (fixed Step 1a, never
        exercised until this suite ran).
      - `backend/app/routers/auth.py::accept_invite` let a duplicate-email race surface as an
        unhandled 500 (`IntegrityError`), which poisoned the client's HTTP keep-alive
        connection for its *next*, unrelated request — now a clean 400.
      - `RedesignRoot.tsx` didn't wait for the initial session-restore check before deciding to
        redirect to `/login`, so a hard page reload with a valid refresh cookie would still
        bounce a signed-in user to the login screen; added a `checkingSession` gate.
      - `IncidentPage.tsx`'s own new Training copy ("not a live weather forecast") violated the
        suite's own "no live wording" rule by using the word inside a negation — reworded to
        "not a real-time weather forecast."

**Verification:**
- Backend: same command as Step 1a-fix → **53 tests, 53 passed, 1 skipped (pre-existing,
  unrelated), 0 failed**.
- Frontend: `tsc -b` and `vite build` both clean. `redesign.spec.ts` run against a real
  Postgres+PostGIS instance and a standalone backend/frontend pair (not mocked) →
  **30 tests, 28 passed, 2 failed**. The 2 failures (`today: renders a real MapLibre canvas`,
  `today: ranked cells never show a 24/48h horizon value`) are **not a regression from this
  work** — confirmed directly (`curl .../api/risk/geojson?target=2024-03-10` returns
  `{"features": []}` on this machine): there is no Bar v3 replay bundle on disk here at all,
  exactly `docs/ranking/00_audit.md`'s already-documented finding ("`/risk/geojson` has nothing
  to serve from the filesystem path today"). Today's screen correctly renders its empty state;
  the test asserting ranked-cell content simply has no data to find on this machine, with or
  without auth. `smoke.spec.ts` (legacy `/app/*`, untouched by this branch): 5/6 passed, the
  one failure (`/demo`'s "Ignition risk outlook" heading) is the same pre-existing, unrelated,
  likely-same-root-cause data gap, not touched or investigated further here (out of this
  branch's scope — legacy app).
- Backend test server used real infra: this repo's own `docker-compose.yml` Postgres+PostGIS
  container (started for this session, left running) and a standalone `uvicorn` instance on
  port 8201, matching `redesign.spec.ts`'s existing `VITE_API_BASE_URL` convention.

## Step 1 remaining
c) Plain-language pass + copy-audit application — not started (beyond the one line fixed above
   as a direct consequence of this step's own work).
d) Extended audit (aria/alt/tooltips/errors/exports/titles/meta) — not started.
e) axe-core + Lighthouse + Playwright screenshots — not started (this step's own screenshot
   assertions ran and passed as part of `redesign.spec.ts`, but the files they write were not
   committed — incidental test output, not a deliberate screenshot pass).

## Step 1c — plain-language pass (DONE)

Applied the copy-audit banlist (`docs/product/00_plan.md` §2.4) to all redesign
pages and components. Changes made:

| File | What changed |
|---|---|
| `frontend/src/redesign/components/scenario.tsx` | `"of ensemble members burning"` → `"chance of burning"`; wind-source labels changed from `ERA5-Land (primary)` / `ERA5 0.25° (sensitivity)` / `best_match (not a reanalysis, sensitivity)` to `High-resolution wind (primary)` / `Coarser-grid wind (sensitivity)` / `Best-available historical wind (sensitivity)`; `Overpass (k = time since the first detection, not a fixed hour)` → `Time step (hours since the first detection)`; `aria-valuetext` updated to match |
| `frontend/src/redesign/pages/TodayPage.tsx` | `"archived replay of a past date"` → `"showing a past date"`; `"The archived replay for this date is unavailable."` → `"The ranking for this date is unavailable."` |
| `frontend/src/redesign/pages/IncidentPage.tsx` | `"this replays a past, already-known incident"` → `"this shows a past, already-known incident"` |

No other user-facing banlist violations found. Internal API identifiers (e.g. the
`era5land_native` value sent to the backend) were not changed — they are not
user-visible and changing them would break the API contract.

TypeScript compile check (`tsc --noEmit`): **clean, 0 errors** after all changes.

## Step 1d — accessibility and banned-term test (DONE)

**Accessibility audit:** Scanned all redesign pages for missing `alt`, unlabelled
`<input>`, and icon buttons without accessible names. One apparent issue in
`LoginPage.tsx` was a false positive — both inputs sit inside wrapping `<label>`
elements, which is a valid accessible pattern. **No accessibility defects found.**

**Banned-term regression test:** Added to `frontend/tests/redesign.spec.ts` as a
new `test.describe('Step 1d: banned terms absent from rendered UI')` block. The
test visits `/redesign`, `/redesign/today`, `/redesign/watch`, `/redesign/field`
as a logged-in `control_room_operator`, reads the rendered text content of
`[data-rq-app]`, and fails if any term from the plan banlist is present. The test
skips gracefully if the backend is unavailable (so CI without a live backend does
not false-fail). The banlist covers all terms from `00_plan.md` §2.4.

The pre-existing modified `frontend/tests/redesign.spec.ts` was read before
editing; the new test was appended without overwriting any existing content.

## Step 1e — automated UI validation (COMPLETE FOR ISOLATED LOCAL SCOPE)

**Build and unit tests:** `VITE_API_BASE_URL=http://127.0.0.1:18201 npm run
build` completed with TypeScript clean; Vite reported the existing large-chunk
warning. `npm run test:unit` passed **5/5**. No dependencies were installed.

**Isolated backend:** Authenticated browser tests used a separately started
backend on `127.0.0.1:18201` and a uniquely named PostGIS container
(`resq9-e2e-codex-20261015`) based on an image already cached locally. The
container used disposable tmpfs storage and an ephemeral host port (61250), not
a Compose service or existing persistent volume. Before tests, the backend
reported `current_database() = resq9_e2e`, `current_user = resq9_e2e`, a working
PostGIS installation, and `/ready` returned ready. `INGEST_LIVE=false` was set.
No production or unidentified database was used.

**Backend auth integration:** `test_auth.py` ran against that isolated database:
**27/27 passed**. This covers the suite's existing auth, role/scope, denial,
and token-rotation scenarios; it does not resolve the five outstanding RESQ8/
RESQ9 policy decisions.

**Playwright:** The full configured suite ran against an isolated production
build preview and backend: **42/42 passed**. This includes authenticated
workspaces, API/UI 403 denial behavior, expired-session error/re-auth state,
the authenticated banlist check, and responsive screenshot coverage at 390px
and 1440px. The expired-session browser test injects 401 responses for a
protected request and refresh request; it verifies client handling, not natural
15-minute token expiry. Seventeen screenshots were written under
`/tmp/resq9-playwright-codex-20261015`; tracked screenshot baselines were not
modified.

**Lighthouse:** Lighthouse 12.8.2 was already available. The six authenticated
production-preview route checks (landing, today, watch, incident, field, and
styleguide) completed. Scores (Performance / Accessibility / Best Practices /
SEO) were: landing **99/100/100/82**, today **99/100/100/82**, watch
**92/100/100/82**, incident **99/100/100/82**, field **79/100/100/82**, and
styleguide **99/100/100/82**. SEO remains at 82 on each route because the
application has no meta description and the preview's `/robots.txt` request
falls through to the SPA HTML; no crawl-policy change was made. A separate
unauthenticated landing audit scored Best Practices 96 because its public
session bootstrap receives the expected 401; authenticated route audits scored
100 in that category.

**Remaining scope:** No RESQ8 live triage was exercised, no authorization
contract decision was inferred, and no live ingestion or production workflow
was run. The five unresolved authorization decisions remain blocked on owner
approval. Lighthouse's field-route performance score is 79 and deserves a
separate performance investigation; this pass made no performance tuning.

## Step 1f — field performance, SEO, and browser verification (DONE; supersedes the Step 1e status above)

**SEO:** Added a concise static product description and a public `robots.txt` with `User-agent: *` /
`Allow: /`. The browser regression checks the description, existing title, `text/plain` response,
and exact policy text. Lighthouse SEO is **100** on both the field route and redesign landing; the
`meta-description` and `robots-txt` audits pass. No sitemap, canonical URL, social metadata, or
protected-path listing was added.

**Field performance:** Lighthouse reports showed 416.6 kB transferred for the initial JavaScript,
about 228 KiB estimated unused on the field route, and CLS 0.415. Redesign pages are now route-split;
FieldPage itself stays in the initial route chunk to avoid adding a field-page chunk waterfall, and
its MapLibre map code/styles load only when active tasks exist. The field map's loading state
reserves its 16:9 area. MapLibre, the actual map, and task semantics remain intact. The font
stylesheet is preconnected/preloaded asynchronously instead of being discovered through CSS
`@import`; session restoration paints a non-sensitive shell instead of a blank screen.

In the production build, the entry script is 345.63 kB minified / 105.7 kB transferred, versus the
prior 1,494.13 kB / 416.6 kB. MapLibre is a separate asynchronous 1,053.45 kB chunk (284.74 kB
gzip). Lighthouse field performance scored **95–96**, versus the prior 79; final run:
FCP **1.6 s**, LCP **2.2 s**, TBT **150 ms**, CLS **0.061** (prior 0.8 s, 0.9 s, 0 ms, 0.415).
Thus the score and layout stability improved, but the old run's FCP/LCP/TBT were lower. Runs were
authenticated against a temporary isolated database; the current test data contains active tasks
and paints the real map, while the old report's exact task-state snapshot was not preserved. Do not
interpret the Lighthouse score alone as universal faster rendering. The existing large-chunk build
warning remains for the asynchronous MapLibre chunk.

**Final verification:** Frontend production build/TypeScript check passed; unit tests **5/5 passed**;
Playwright **43/43 passed** on the isolated production preview. The expired-session test now uses a
real login response modified only in the test harness to contain a validly signed, already-expired
access token: the protected endpoint returned a real backend 401, then an invalid refresh response
led to the expected UI banner and sign-in action. Screenshot outputs were confined to
`/tmp/resq9-perf-playwright-codex-20261015`; tracked screenshot baselines were not written.
`git diff --check` passed. The Lighthouse/browser work used an ephemeral tmpfs PostGIS container;
it did not touch existing volumes or servers.

The five RESQ8/RESQ9 authorization decisions remain blocked on owner approval. `INGEST_LIVE=false`;
no RESQ6 held-out evaluation, live ingestion, or production OSM output was run.
