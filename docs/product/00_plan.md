# 00. Product pass — plan (Step 0)

Branch `resq9/product-pass`, forked from `redesign-v2` at `a2bebb8` ("RESQ redesign Phase 2:
copy audit"). Goal per the brief: make RESQ a product, not a research demo — real role-based
auth, plain-language UI, no research content exposed to users, an honest Training/Live
data-status model. This doc is Step 0 only: a plan to approve before any code changes. Nothing
in `backend/`, `frontend/`, or any doc outside `docs/product/` has been touched by this branch yet.

Concurrent, untouched branches: `resq6/simulation-engine` (spread/inference code), `resq8/firms-
ingestion` (live detection feed). This plan designs against `resq8`'s documented `GET
/ingest/health` contract (read via `git show resq8/firms-ingestion:docs/ingest/00_design.md`,
read-only) but implements no ingestion. `docs/sim_diagnosis/` not touched.

## What I read before writing this

- `docs/redesign/COPY_AUDIT.md` (committed on `redesign-v2`, not yet applied) — the full
  string-by-string audit. Its findings are carried forward rather than redone; see §4.
- `docs/redesign/00_audit.md`, `02_users_and_use_cases.md`, `04_information_architecture.md`,
  `05_landing_page.md`, `06_simulation_ui.md`, `07_maps.md`, `08_design_system.md`,
  `09_trust_rules.md`, `10_backend_contract.md`, `11_build_plan.md`, `PROGRESS.md`,
  `LIGHTHOUSE.md` — the full redesign-v2 design/build record.
- `docs/PRODUCT_RULES.md` (global honesty rules, still binding).
- `backend/app/routers/auth.py`, `backend/app/core/security.py`,
  `backend/app/database/session.py`, `backend/app/contracts/schemas.py` — the existing auth
  scaffolding (see §1.0).
- `frontend/src/redesign/**` (all pages, `RoleSwitcher.tsx`, `primitives.tsx`, `map.tsx`,
  `lib/types.ts`, `lib/api.ts`, `lib/fieldQueue.ts`) and `frontend/src/app/App.tsx`,
  `frontend/src/lib/api.ts`, `frontend/src/lib/offlineQueue.ts` (the legacy app's parallel,
  real auth — see §1.0).
- `backend/app/routers/redesign.py`, `backend/app/services/redesign_data.py`,
  `backend/app/services/redesign_store.py` — current redesign-v2 backend surface.
- `backend/tests/test_redesign_data.py`, `frontend/tests/redesign.spec.ts` — existing test
  coverage, to know what must keep passing or be deliberately updated.
- `git show resq8/firms-ingestion:docs/ingest/00_design.md` (read-only, branch untouched) — the
  `GET /ingest/health` contract this plan designs the Live-workspace chip against.
- `frontend/public/tiles/resq-basemap.pmtiles` (confirmed 37 MB on disk, `ls -lh`).

## §1.0 — Starting point: two unrelated auth stories in this repo

This matters enough to state plainly before the design, because it changes what "extending the
existing JWT scaffolding" means.

**A. `/app/*` (legacy operations dashboard) has real, working auth today.** `backend/app/routers/auth.py`
(`POST /api/auth/login`, bcrypt check against `resq_users.password_hash`) +
`backend/app/core/security.py` (`make_token(user_id, role)` → HS256 JWT, 12h expiry, no
refresh; `current_user` dependency decodes a `Bearer` header; `require_write` checks
`role in {'admin','officer'}`). `resq_users` (raw SQL table, no ORM, created idempotently in
`database/session.py::init_db()`) has `role CHECK (role IN ('admin','officer','viewer'))`,
seeded with 3 dev users (`admin@resq.local` / `officer@resq.local` / `viewer@resq.local`,
password `resq-demo`, bcrypt-hashed). The frontend (`frontend/src/app/App.tsx`,
`src/components/Login.tsx`) stores the token in `localStorage` (`resq_token`/`resq_user`) and
gates `officerOnly`/`adminOnly` route arrays client-side. This stack is real but scoped only to
`/app/*` (plans/incidents/alerts/admin/settings/spread-jobs) — **out of this task's scope**,
per the brief's own instructions not to touch simulation code, and because none of the five
target roles map onto admin/officer/viewer.

**B. `/redesign/*` (the actual product surface) has no backend auth at all.**
`backend/app/routers/redesign.py`'s nine endpoints take zero `Depends(current_user)`.
`frontend/src/redesign/components/RoleSwitcher.tsx` is explicit in its own doc-comment:
*"Client-side role preview only — no real auth."* It stores a role string
(`range_officer|control_room|field_crew|incident_commander|reviewer`) in `localStorage`
(`rq_role`), never sent to the backend in any enforced way — `POST
/detections/{id}/actions`'s `role` field is an unvalidated plain string. This is the surface
this task builds real auth for.

(A third thing, unrelated: `git log --all` surfaces dead ancestry — `OperationsAuthGuard`,
Supabase, "Jalari" maritime-app commits — from a different prior project merged into this
repo's history. None of those files exist in the current tree. Not referenced below.)

**Decision taken:** extend `resq_users` (same table, same idempotent-DDL style already used in
`database/session.py`) with four new role values, rather than building a parallel user table or
remapping/breaking the legacy roles. New `role` CHECK becomes `IN ('admin','officer','viewer',
'range_officer','control_room_operator','field_crew','incident_commander')`. `admin` is reused
as-is for both surfaces (one superuser concept); `officer`/`viewer` stay legacy-only and
untouched; the four new values back this task's product roles. This is additive — no existing
`/app/*` row, check, or query changes. **Flagged for explicit sign-off** since it's the one
schema change touching a table the legacy app also reads.

## 1. Auth design

### 1.1 Roles (replacing RoleSwitcher's five, dropping Reviewer/judge)

| Role | Maps from (`02_users_and_use_cases.md`) | Home screen |
|---|---|---|
| Admin | new — not a prior use case; creates/manages accounts | Admin console (new, minimal: user list, invites, audit log) |
| Range officer | User 1 | Today |
| Control-room operator | User 2 | Watch |
| Field crew | User 3 | Field |
| Incident commander | User 4 | Incidents / Incident scenario |

"Reviewer / judge" (User 5) is dropped — its only consumer, the Replay/evidence screen, was
already removed from the UI in `daafa53`. No public, no-login route remains for it (see 1.6
open question on `/demo`).

### 1.2 Data model (additive migration, same `database/session.py::init_db()` idiom)

- `resq_users.role` CHECK extended as in §1.0.
- `resq_users.password_algo TEXT NOT NULL DEFAULT 'bcrypt'` — new accounts created via this
  task's invite flow are hashed with **argon2** (`argon2-cffi`, added to
  `backend/requirements.txt`) and get `password_algo='argon2'`; the 3 existing dev-seeded
  bcrypt rows are untouched and keep working (`login` checks `password_algo` to pick the
  verifier). No forced-rehash migration — avoids silently invalidating the legacy demo logins.
- `resq_users.home_state VARCHAR(2)` nullable — primary state for scoping (see 1.3).
- `resq_user_scopes(user_id INT REFERENCES resq_users(id), state VARCHAR(2), PRIMARY KEY
  (user_id, state))` — many-to-many, for a user covering more than one state. Admin bypasses
  scope checks entirely (sees/acts everywhere); every other role must have at least one
  `resq_user_scopes` row to see *any* state-scoped data — default-deny, not default-allow.
- `resq_refresh_tokens(id BIGSERIAL, user_id INT REFERENCES resq_users(id), token_hash TEXT
  UNIQUE, issued_at, expires_at, revoked_at, device_id TEXT, user_agent TEXT)` — refresh tokens
  are stored hashed (never plaintext), rotated on every use, and a reused/already-rotated token
  revokes the whole chain for that user (forces re-login) and writes an audit-log row
  (`token_refresh_reuse_detected`) — standard rotation-detection pattern.
- `resq_invites(id BIGSERIAL, email TEXT, role TEXT, scopes TEXT[], token_hash TEXT UNIQUE,
  created_by INT REFERENCES resq_users(id), created_at, expires_at, accepted_at)` — Admin-created,
  invite-only account creation (1.4).
- `resq_password_resets(id BIGSERIAL, user_id INT REFERENCES resq_users(id), token_hash TEXT
  UNIQUE, created_by INT REFERENCES resq_users(id), created_at, expires_at, used_at)` —
  **admin-initiated** resets (distinct from the existing inert `password-reset/request`, which
  only logs a self-service request with no actual reset capability; that endpoint is kept as-is
  for the legacy app, untouched).
- `resq_login_attempts(id BIGSERIAL, email TEXT, ip TEXT, attempted_at, success BOOL)` — backs
  rate limiting (1.5) with a plain time-window query, no new infra (no Redis/slowapi) —
  flagged as a deliberate low-infra choice; easy to swap later if the user wants shared-infra
  rate limiting across multiple backend instances.
- `resq_audit_log(id BIGSERIAL, occurred_at TIMESTAMPTZ DEFAULT now(), user_id INT, device_id
  TEXT, action TEXT, previous_state TEXT, entity_type TEXT, entity_id TEXT, metadata JSONB
  DEFAULT '{}')` — see 1.7. **Name chosen to not collide** with `resq8/firms-ingestion`'s
  independently-designed `resq_triage_audit_log` (different branch, different concern,
  reconciled at merge time, not by this plan).

### 1.3 Permission matrix (enforced server-side via FastAPI dependencies, not hidden in UI)

Every `/api/redesign/*` and new `/api/auth/*` endpoint gets an explicit `Depends(...)`. Admin
passes every check. Scope checks apply the `resq_user_scopes` table against the state(s) the
requested resource belongs to (risk cell's state, detection's state, task's state, incident's
state).

| Endpoint | Admin | Range officer | Control-room operator | Field crew | Incident commander |
|---|---|---|---|---|---|
| `GET /api/risk/geojson` (Today) | ✓ | ✓ (own scope) | ✓ (own scope) | – | ✓ (own scope) |
| `GET /api/redesign/detections` (Watch) | ✓ | ✓ read, own scope | ✓ read/act, own scope | – | ✓ read, own scope |
| `POST /detections/{id}/actions` (verify/dismiss/escalate) | ✓ | – | ✓ (own scope) | – | – |
| `GET /detections/{id}/history` | ✓ | ✓ own scope | ✓ own scope | – | ✓ own scope |
| `GET /api/redesign/field/tasks` | ✓ | – | – | ✓ (assigned only) | – |
| `POST /api/redesign/field/reports` | ✓ | – | – | ✓ (assigned only) | – |
| `GET /api/redesign/field/reports` | ✓ | – | ✓ own scope | – | ✓ own scope |
| `GET /incidents/{id}/scenario` (Incident) | ✓ | – | ✓ read, own scope | – | ✓ (own scope) |
| `GET /api/meta` (workspace/freshness, new, §2) | ✓ | ✓ | ✓ | ✓ | ✓ (public-ish; no secrets) |
| `POST /api/auth/invites`, `GET .../invites` | ✓ | – | – | – | – |
| `POST /api/auth/password-reset/admin-initiate` | ✓ | – | – | – | – |
| `GET /api/auth/audit-log` | ✓ | – | – | – | – |
| `GET /api/auth/me`, `POST /login`, `/refresh`, `/logout` | all roles (self) |

A request outside a role's row returns `403` (handled uniformly, see 1.6 Forbidden screen); a
request for a resource outside the caller's `resq_user_scopes` also returns `403`, not a
filtered-empty `200` — so a scope violation is visibly a permission error, not indistinguishable
from "nothing here."

**Nav visibility mirrors this matrix** (`04_information_architecture.md`'s per-role nav table,
carried forward) but is explicitly *not* the enforcement mechanism — hiding a nav link is a UX
convenience; the dependency on the endpoint is what actually blocks the request.

### 1.4 Account creation — invite-only

- `POST /api/auth/invites` (Admin): `{email, role, scopes: [state,...]}` → creates a
  `resq_invites` row, one-time token (plaintext returned once to the Admin's own UI /
  dev-seed script output; never emailed by this codebase — no email-sending integration exists
  anywhere in this repo today; same deferred pattern as the existing `password-reset/request`
  endpoint's comment: *"Delivery is a deployment integration"*). Expires in, e.g., 7 days.
- `POST /api/auth/invites/{token}/accept`: `{password}` → creates the `resq_users` row
  (argon2-hashed), marks the invite accepted. No self-registration path exists anywhere.
- `GET /api/auth/invites` (Admin): list pending/accepted/expired invites.

### 1.5 Session mechanics

- **Access token:** short-lived JWT (15 min), HS256, returned in the login/refresh response
  body, held in memory by the SPA (not `localStorage`, to reduce XSS blast radius — a change
  from the legacy app's pattern, deliberate for this new surface).
- **Refresh token:** httpOnly, `Secure`, `SameSite=Strict` cookie, 14-day expiry, rotated on
  every use (`resq_refresh_tokens`), reuse-detected (1.2).
- `POST /api/auth/refresh` — reads the cookie, rotates it, returns a new access token.
- `POST /api/auth/logout` — revokes the current refresh token, clears the cookie.
- **Rate limiting:** 5 failed `/login` attempts per email+IP in 15 minutes → `429` + 15-minute
  lockout window (1.2's `resq_login_attempts`, time-window `COUNT` query, no new infra).
- **Audit log** (1.7) written on: `login_success`, `login_failed`, `logout`,
  `token_refresh`, `token_refresh_reuse_detected`, `invite_created`, `invite_accepted`,
  `password_reset_admin_initiated`, `password_reset_completed`, `permission_denied`, plus the
  existing triage/field-report actions (migrated from the current ad-hoc SQLite store into this
  unified log — see 1.7).

### 1.6 Screens

- **Login** (`/redesign/login`) — email+password only (no self-registration, no "forgot
  password" self-service — copy: *"Forgot your password? Ask your admin to reset it."*,
  matching the admin-initiated-only reset design). Redirects to the role's home screen on
  success, or back to the originally-requested route if the user was redirected here by a
  guard.
- **Logout** — an action (button in header), not a screen; calls `/logout`, clears in-memory
  access token, redirects to `/redesign/login`.
- **Forbidden (403)** (`/redesign/403`) — adapts the existing legacy `ForbiddenPage` pattern
  (`frontend/src/pages/...` per the audit) rather than inventing a new one. States plainly what
  the user tried to do and that their role doesn't allow it; link back to their own home screen,
  never a generic "go back."
- **Expired session** — *not* a full-page takeover. A dismissible-but-persistent banner/prompt
  ("Your session expired. Sign in again.") that overlays the current screen without unmounting
  it, specifically so Field's `SyncQueue` stays visible and mounted while the prompt is up (see
  1.8). On non-Field screens a full re-auth screen is acceptable since there's no queued local
  state at risk.

### 1.7 Audit log

Unifies auth events and the existing triage/field actions (currently written ad-hoc to
`backend/app/services/redesign_store.py`'s SQLite `triage_actions` table with `previous_state`
*inferred* by scanning history) into `resq_audit_log` with `previous_state` written explicitly
at write time (same improvement `resq8`'s independently-designed `resq_triage_audit_log`
makes for its own ingestion-triage path — convergent design, not coordinated, reconciled later
at a merge the coordinating session will need to handle, not this plan). `GET
/api/auth/audit-log` (Admin-only, paginated, filterable by user/action/date) makes it readable,
not just a write-only table.

### 1.8 Field PWA: expired token while offline

The existing `frontend/src/redesign/lib/fieldQueue.ts` already does the right thing for this
independent of auth: `enqueueReport()` writes to `localStorage` (`rq_field_queue`) with a
client-generated `idempotency_key` **before any network attempt**. This task extends it rather
than replacing it:

1. Field crew submits a report while offline or with an expired access token. It enqueues
   exactly as today — state `pending`, nothing network-dependent happens yet.
2. A reconnect/foreground sync routine attempts to flush the queue. If the access token is
   expired, it first tries silent refresh (`POST /refresh` against the httpOnly cookie) — if
   that succeeds (user was offline but the refresh cookie is still valid and the browser just
   regained signal), the queue flushes automatically, no user action needed.
3. If refresh also fails (refresh cookie itself expired/revoked — e.g. offline longer than 14
   days, or logged out on another device), the queue item's state becomes a **new, distinct**
   `pending-auth` (not `failed` — `failed` today implies a retryable network/server error; this
   is specifically "needs you to sign back in," a different reason shown to the user: *"Waiting
   for sign-in"*). The non-blocking expired-session prompt (1.6) appears. The queue item is
   never dropped, never silently discarded.
4. On successful re-login, the sync routine automatically retries every `pending`/`pending-auth`
   item with its original `idempotency_key` (unchanged — this is exactly what the existing
   server-side dedupe-on-idempotency-key behavior, already tested in
   `redesign.spec.ts`'s `field: duplicate idempotency key is deduped server-side`, is for) —
   no duplicate writes, no lost reports.

## 2. Data-status model: Training vs Live workspaces

### 2.1 Resolving the workspace

New `GET /api/meta` (no auth required — contains no sensitive data, just status), modeled on
the same env-flag idiom `resq8/firms-ingestion`'s design doc uses for `INGEST_LIVE`:

```
GET /api/meta →
{
  "workspace": "training" | "live",   // from RESQ_WORKSPACE env, default "training"
  "screens": {
    "today":    { "live": false, "blocked_on": "daily tomorrow-ranking job (not built)" },
    "watch":    { "live": <bool>, "blocked_on": "FIRMS ingestion", "freshness": <see 2.3> },
    "incident": { "live": false, "blocked_on": "forecast weather feed (not built)" }
  }
}
```

The frontend fetches this once at boot and drives the header chip + per-screen framing from it,
rather than each screen guessing independently.

### 2.2 Which screens are blocked on which feed, and why (stated plainly, not glossed over)

| Screen | Backing feed required for Live | Current status | Realistically unblockable by... |
|---|---|---|---|
| Today | A **ranking model actually served** (daily run against current data). Today, Bar v3 only serves an **archived 2023–2024 replay** (`models/barv3/bar3_replay_*.npz`), confirmed in `00_audit.md`, and per `docs/ranking/00_audit.md`/`01_option_b.md` has no persisted weights to serve from live anyway — EI-1 boosting is the only realistically servable candidate found. | **Training today** | Not a plan/code change here — `/api/meta` reports `today.live` from whether a ranking job is actually running; the moment one ships (this task or another), Today flips with **no frontend code change**, because the frontend renders off `/api/meta`, never off a hardcoded assumption. |
| Watch | **FIRMS ingestion**, i.e. `resq8/firms-ingestion`'s `INGEST_LIVE` flag + `GET /ingest/health`. | **Training until `resq8` ships and is flipped on** | `resq8`'s own Step 0 doc (read-only, not touched here) — once merged and `INGEST_LIVE=true`, Watch can flip live automatically (this plan wires the display plumbing now, §2.3, so no further frontend work is needed at that point). |
| Incident | **The incident schema and the simulation shipping as a live capability** — today's wind sources (ERA5-Land, ERA5 0.25°, best_match) are all historical reanalysis/archival, used to replay fixed past incidents, not a live forecast feed. | **Training today** | Same pattern as Today: `/api/meta` reports `incident.live` from whether the incident schema + simulation are actually live; not a plan/code change here, and not assumed to stay this way. |

Honest summary: **today, neither Today nor Incident has an in-flight branch building their
backing feed** — but this is a statement about present status, not a permanent architectural
ceiling. Both screens read their live/training status from `/api/meta` exactly the way Watch
does; the moment a ranking job or a live incident/simulation capability actually exists and
`/api/meta` reports it, those screens flip to Live automatically, with zero frontend code
change, because nothing here hardcodes "Today is always Training." **Watch is the one screen
with a real, named, in-progress path to Live right now** (`resq8`); Today and Incident simply
don't have one *yet*.

### 2.3 Header chip and freshness

- **Training workspace:** one small chip in the header (`<RedesignRoot>`'s nav bar), not a badge
  repeated on every panel — replacing all 6 current `SampleDataBadge` call sites
  (`LandingPage`, `TodayPage`, `WatchPage`, `IncidentPage`, `FieldPage`, `StyleguidePage`) and
  the `redesign.spec.ts` assertion that currently checks `getByTestId('sample-data-badge')` on
  every screen (updated to check the one header chip instead).
- **Live workspace:** no demo tag anywhere. Per-feed freshness line instead, sourced from
  `/api/meta`'s `screens.watch.freshness` (itself sourced from `resq8`'s `GET /ingest/health` —
  `{last_success_at, detection_count, stale, stale_after_minutes}` once that branch exists;
  until then, `/api/meta` reports `watch.live: false` and the freshness line simply doesn't
  render — this plan's Watch display code is written against the documented contract and is
  inert, not broken, if `/ingest/health` isn't reachable yet).
  - Rendered as "Updated 12 min ago" (relative time from `last_success_at`).
  - `stale: true` → a visible stale-warning line ("No update in over 6 hours — showing the last
    known detections"), not a silent freeze.
- Today and Incident are in Training today, per 2.2 — their chip text says so plainly without
  claiming a specific near-term date: e.g. "Training — archived replay data" rather than a bare
  "Training" that invites the question "when does this go live," and without the word
  "permanently" either, since that's not actually true — it flips the moment `/api/meta` says so.

## 3. Plain-language glossary

Target reading level ≈ Class 8. Every technical term currently in the UI, mapped:

| Term | Where today | Plain replacement / decision |
|---|---|---|
| VIIRS | Watch detection cards, Incident wind-source labels, docs copy that leaked into UI | "satellite" (generic) — the specific instrument name is removed from user-facing copy entirely; kept in code/data/internal docs. |
| Overpass (`k = ...`) | Incident's old timeline slider label ("Overpass (k = time since first detection...)") | **Removed.** Replaced by an hours slider: 6h / 12h / 24h / 48h (task-specified), framed as scenario timeline stops, not satellite-pass count. Label: "Hours since the fire was confirmed." |
| Burn probability | Incident map legend | "Chance of burning" — bands kept as percentages (0–20%/20–50%/50–80%/80–100%), plain words already mostly in place per `08_design_system.md`. |
| Ensemble | Not directly user-facing today, but implied by "members" language | Removed from any user-facing copy; internal term only. |
| ERA5 / ERA5-Land | Wind-source switch options | Removed as the primary label. See `best_match`/`reanalysis`/`sensitivity` row below — the whole control moves to Advanced. |
| Reanalysis | Wind-source option subtext ("ERA5 0.25° (sensitivity)") | Removed from default view entirely (Advanced-only, see below); if shown at all in Advanced, "a weather record rebuilt from past data" as a hover explainer, not inline. |
| Sensitivity (modeling sense) | Wind-source subtext | Removed from user-facing copy. |
| best_match | Wind-source option label | Removed as a visible label in default view; Advanced-only option labeled "Alternate weather source." |
| Bar v3 | Today's model-name line | "the ranking model" or dropped entirely from the primary sentence; if a build/version identifier is needed for support purposes, moved to a footer/about line, not the main content area. |
| Uncalibrated | TrustBadge text ("Uncalibrated scenario") | Kept as a concept but reworded: "This is one simulated guess, not a forecast." — the badge's job (the single most important honesty string in the app, per `COPY_AUDIT.md`) is preserved, the word "uncalibrated" itself is removed since it's jargon that doesn't tell a range officer what to do with the information. |
| ERA5/ERA5-Land, best_match (again, assumptions panel) | AssumptionsPanel fuel/weather text | Rewritten in the plain-language pass (3.1) — panel kept (it's real, load-bearing honesty content per the audit) but its density is reduced per the audit's own "style" flag. |
| Cell (grid cell) | Today's "Cell {N} · {State}" | Kept — "cell" here means a patrol/forest unit, which is close enough to its plain meaning (a patch of forest) that range officers already using this tool understand it; flagged as **borderline**, not changed, since the audit found no evidence it confuses the actual users (vs. a judge/outside reader). |
| PMTiles | Never user-facing (an asset format, not a label) | No change needed — confirmed not rendered anywhere in UI copy. |
| FRP (Fire Radiative Power) | Not currently rendered in UI copy (used server-side for sort order only, per `resq8`'s design doc) | No change needed — stays internal/sort-only, never shown as a raw number to a user. |
| Confidence | Detection cards (`confidence: low/nominal/high`) | Kept as "Confidence: Low/Medium/High" — already plain English, just relabel "nominal" → "Medium" for the one non-obvious value. |
| Baseline | Already removed from UI per `daafa53`; only the one caveat line remains ("Estimate from forecast wind and fuel. Real fires can differ.") | No change — task's "one caveat line only" rule already satisfied by the prior removal commit; this plan keeps it as-is. |

### 3.1 Other plain-language changes carried from `COPY_AUDIT.md`

- Wind-source control ("ERA5-Land (primary)" / "ERA5 0.25° (sensitivity)" / "best_match (not a
  reanalysis, sensitivity)") moves under an **Advanced** disclosure, closed by default,
  defaulting to automatic ("Recommended") selection — resolves the audit's "reword" flag by
  removing the jargon from the default view entirely rather than just relabeling it.
- AssumptionsPanel fuel/weather/terrain text: shortened per the audit's density flag, same
  factual content, shorter sentences, Class-8 target.
- Today's six-state scope explainer (`09_trust_rules.md`'s long sentence) shortened per the
  audit's "style" flag — same two facts (no 24/48h forecast; six-state-only) in fewer words.

### 3.2 Strings architecture (translation-ready, not translated now)

New module `frontend/src/redesign/lib/strings.ts` (sibling to the existing `lib/api.ts`,
`lib/types.ts`, `lib/fieldQueue.ts`, matching that directory's convention), structured as:

```ts
export const STRINGS = {
  en: {
    nav: { today: 'Today', watch: 'Watch', ... },
    today: { title: 'Tomorrow's patrol priority', ... },
    watch: { ... },
    incident: { ... },
    field: { ... },
    auth: { loginTitle: 'Sign in', forbidden: '...', sessionExpired: '...' },
    common: { trainingChip: 'Training — archived replay data', ... },
  },
  // hi: {...}, te: {...}  — added later, same keys, not populated now
} as const;
```

A thin `useStrings()` hook (reads a locale from a React context, defaulting to and currently
only supporting `'en'`) replaces every inline string literal in the 6 redesign pages +
`primitives.tsx`/`map.tsx`/`watch.tsx`/`field.tsx`/`scenario.tsx`. This is a mechanical
extraction, not a rewrite of meaning — every string's *content* is whatever this plan's
plain-language pass decides; this section only fixes *where* strings live. ARIA labels, alt
text, tooltips, error messages, exported-briefing text, and page titles/meta descriptions (Step
1d) all route through the same module so there's one place to audit, not six.

## 4. Applying the copy audit + explicit task instructions

`COPY_AUDIT.md`'s verdicts are almost all **Keep** — this section lists only what changes,
building on (not redoing) that audit.

- **Landing hero rewrite** (task-specified, supersedes the audit's narrower "fix the last
  clause" suggestion): new headline **"See where fire is likely tomorrow. Act on it today."**
  Subhead rewritten plain-language to describe the three screens without the removed
  baseline-comparison clause and without "Three tools, not one." as the H1 (that line either
  moves to a smaller subhead or is cut — decided during the actual copy pass, not here, since
  it's a wording choice within an already-approved structural change, not a scope decision).
  Resolves the audit's flagged (b)-test failure (describing a removed feature) by replacing the
  whole paragraph rather than patching its last clause.
- **Landing's "Who are you?" role-card section**: with real auth replacing the role switcher,
  this becomes either plain descriptive cards (what each of the 4 operational screens does, no
  login shortcut implied) or is folded into the existing "three-step flow" section to avoid
  duplicating content. One "Sign in" CTA replaces any role-specific entry point.
- **Today / Incident plain-language pass**: per §3.
- **Incident's hours slider**: 6/12/24/48h, replacing "Overpass (k = ...)" framing — per §3,
  task-specified.
- **One caveat line only** on Incident ("Estimate from forecast wind and fuel. Real fires can
  differ.") — already true since `daafa53`; this plan makes no further change here, just
  confirms it stays as the only caveat (no reintroduction of baseline language).
- **`/redesign/styleguide` → dev-only route**: not reachable from the normal nav (resolves the
  audit's open "does this belong in production nav" question — decided: no). Gated behind a
  build-time flag or a route only reachable with a `?dev=1` query/dev-mode check, not linked
  from `RedesignRoot`'s nav bar.
- **Landing gets a static real-map image**: replaces the current live interactive map-strip
  placeholder (resolves the audit's other open question — decided: cut the interactive
  placeholder, since Today already has the real map one click away, exactly as the audit's
  reasoning suggested). A pre-rendered screenshot/render, not a MapLibre instance — no WebGL
  cost on the landing page. This also directly fixes the bundle-weight finding in §4.1.
- **390px screenshots** for all 6 screens (Today/Watch/Incident/Field/Landing/Login, plus 403 and
  expired-session states) — Step 1e.

### 4.1 Performance: lazy-loading the map, shrinking PMTiles

Confirmed directly (not assumed): `RedesignRoot.tsx` statically imports every page including
`LandingPage`, and `frontend/src/redesign/components/map.tsx` (MapLibre + pmtiles +
`@protomaps/basemaps`) is imported by 5 of 6 pages — so the ~1MB+ map bundle currently loads on
every `/redesign/*` route including Landing, confirmed in `LIGHTHOUSE.md`'s own findings.

- **Lazy-load**: `React.lazy()` + `Suspense` around each page's import in `RedesignRoot.tsx`,
  and specifically around `map.tsx`'s usage within Today/Watch/Incident/Field (not Landing,
  which no longer needs it per the static-image decision above, and not Styleguide, which is
  now dev-only). A route without a map (Landing, Login, 403, expired-session) ships zero
  MapLibre/pmtiles code.
- **Shrink the PMTiles bundle for the demo area specifically**: the current single 37MB extract
  (zoom 0–10, all six states + margin) is used identically by every map screen today. Plan:
  split into (a) a small, coarse low-zoom extract for the state-wide overview screens (Today,
  Watch) and (b) a much tighter, higher-max-zoom extract scoped to just the four replay
  incidents' bounding boxes (~20km buffer each) for Incident/Field, which only ever show one
  incident/task fully zoomed in. Re-cutting via `go-pmtiles extract` is Step 1 work; this plan
  only sets the target (meaningfully smaller per-screen payload for the incident-zoom screens,
  not necessarily a smaller combined on-disk total).

## 5. Step 1 build order (preview only — not started)

Matches the task's lettered sub-items, committing after each:

- **1a** Auth backend (migration, `/api/auth/*` endpoints, permission dependencies wired onto
  every existing `/api/redesign/*` + `/api/risk/*` endpoint) + frontend (Login, 403,
  expired-session banner, `RoleSwitcher` deletion) + tests (permission matrix per role per
  endpoint, offline-expired-token queue behavior, rate limiting, audit log entries).
- **1b** `/api/meta`, header chip, Watch freshness/stale display wired against `resq8`'s
  documented (not implemented-by-us) contract.
- **1c** Plain-language pass + copy-audit application (§4), existing string-asserting tests
  updated, `test_redesign_data.py` (replay/baseline) left untouched as internal-only coverage.
- **1d** Extend the audit to aria-labels/alt text/tooltips/error messages/exported briefing
  text/page titles/meta descriptions; report remaining research-flavored language found.
- **1e** axe-core + Lighthouse + Playwright screenshots (390px/1440px) on every screen,
  including the new Login/403/expired-session screens.

## 2.4 — Ranking-audit decisions applied (amendment, read `docs/ranking/00_audit.md` and
`docs/ranking/01_option_b.md` from `resq10/ranking-audit`, read-only)

- **Today has no serving model today; this reads from `/api/meta`, not a hardcoded assumption
  (per the user's correction — not "permanently Training").** Today's `blocked_on` text in
  `/api/meta` changes from "a daily tomorrow-ranking job (not built)" to "no ranking model is
  served yet," and the moment that stops being true — whether via `resq10`'s EI-1 path or
  anything else — Today flips to Live automatically, with no frontend code change, because the
  frontend already renders off `/api/meta`'s `screens.today.live` boolean rather than a
  hardcoded flag. **No "live" text anywhere on Today while `live` is `false`**, enforced by the
  existing Playwright string-assertion rule (unchanged by this amendment, kept not loosened).
- **Future-model copy is specified now, not deferred to the copy pass.** §3's "Bar v3" row
  ("the ranking model" / dropped) is superseded by this exact template, to be used verbatim
  once/if a model is ever served: **"Areas near recent fires and with dry, windy forecasts
  rank higher."** — a plain description of *why* a cell ranks, with no model name, no metric,
  no version number. This sentence is added to `strings.ts` (§3.2) under `today.liveExplainer`
  now, even though it renders nothing until `workspace.screens.today.live` is `true` — same
  "written against the contract, inert until then" pattern already used for Watch's freshness
  line (§2.3).
- **Blanket rule, elevated from the glossary table to a standing constraint on all of Step 1d
  (the extended copy audit):** no metrics, baselines, model names, or research terms anywhere
  in rendered UI text — not just the terms §3's table already caught. 1d's job expands from
  "find remaining research-flavored language" to also include a final grep-based test
  (`frontend/tests/redesign.spec.ts`) asserting none of a maintained banlist (`bar v3`, `ei-1`,
  `ei-0`, `a-prime`, `auroc`, `log loss`, `average precision`, `brier`, `ensemble`, `boosting`,
  `lightgbm`, `era5`, `viirs`, `reanalysis`, `% ap`, `csi`) appears in any rendered screen —
  mechanical enforcement, not just manual audit, since the ranking-audit docs introduce several
  new research terms (EI-1, A-prime, LightGBM, AP/AUROC) that must never reach this UI even by
  accident during Step 1 build.

## 2.5 — Audit-log interface for `resq8/firms-ingestion` (scope-rule deliverable)

Per `docs/ingest/00_design.md` §8a (`resq8`'s own doc, read-only, confirms this product-pass
branch owns the real audit log and that `resq8` writes *through* it, not a second table), the
function signature, event types, and table are now specified in **`docs/product/AUDIT_LOG.md`**
so `resq8` can code against a stable contract before Step 1a lands. This resolves §8a's three
open questions: the write shape, the "latest status per entity" read, and the entity-identifier
contract (`entity_type: 'detection'|'candidate'`, `entity_id` = `resq8`'s own id). `resq8/firms-
ingestion` itself is not touched by this plan — only read via `git show`, per scope.

## Sign-offs (resolved — user approval on the plan-approval message)

1. **`resq_users.role` CHECK extension** (§1.0) — **Approved: additive only, reversible
   migration, no drops.** Implemented in Step 1a as a `DROP CONSTRAINT IF EXISTS` +
   `ADD CONSTRAINT` pair that only ever widens the allowed set; see `database/session.py`.
2. **Public `/demo` / unauthenticated access** — **Cut.** The Training workspace sits behind
   login with one seeded trainee account (`trainee@resq.local`, role `range_officer`, scoped to
   all six states), not a public no-login route. Implemented in Step 1a's migration.
3. **Today and Incident's Live path** — superseded by the amendment in §2.2/§2.4: not
   "permanently Training," reads from `/api/meta` and flips with no code change when the
   backing capability ships.
4. **PMTiles re-split** (§4.1) — **Out of scope for this branch.** Left to
   `resq7/map-layers`; any tile need this branch surfaces gets noted in this file's progress
   log, not built here.

## Step 1a amendments (applied before implementation)

- **Cookie auth hardening**: `SameSite=Strict` on both the refresh and CSRF cookies, plus a
  CSRF token required on every state-changing request (double-submit pattern: cookie value
  must match an `x-resq-csrf` header) — `core/security.py::require_csrf`, applied to
  `/refresh`'s session-rotating effect is covered by SameSite alone since it's cookie-only, and
  to `/logout`, `/invites`, `/password-reset/admin-initiate`, and the redesign triage/field
  write endpoints.
- **Login hardening**: rate limit + lockout (5 failed attempts per email+IP in 15 minutes →
  429), identical generic error message for "wrong password" and "no such account" (no
  account-enumeration), invite and password-reset tokens are random opaque values stored only
  as a sha256 hash, single-use (checked via an atomic `UPDATE ... WHERE accepted_at/used_at IS
  NULL` with a rowcount check, not a read-then-write race), and expiring (7 days / 24 hours).
- **Audit log events, expanded**: `login_success`/`login_failed` (both now written),
  `invite_created`/`invite_accepted`, `permission_denied`-equivalent (`out_of_division_access_
  denied`, written by `core/permissions.py::require_scope` on every out-of-scope attempt, per
  the approved amendment), plus the already-planned `logout`/`token_refresh`/`token_refresh_
  reuse_detected`/`password_reset_admin_initiated`/`password_reset_completed`.

Stopping here per Step 0 instructions — superseded: the plan was approved with the amendments
above; Step 1a is implemented, see `PROGRESS.md`.
