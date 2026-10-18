# TerraWatch

TerraWatch is a wildfire operations platform for India. It connects the people who see a fire, the people who decide what to do about it, and the people who go to the place. It is built around one idea: a fire claim moves up a ladder of certainty, and only people move it up.

---

## 1. What TerraWatch does

| Need | How TerraWatch meets it |
|---|---|
| A citizen sees smoke or fire | They report it in a few taps, with place, time and photos, and follow it until it is closed |
| Staff must decide what is real | Every claim lands in a queue with its evidence; a person verifies it |
| Someone must go and look | A Range Officer is assigned, accepts, visits, and records what they find, even with no network |
| The public needs to know | Official notices are written by one person and approved by a second; verified areas appear on a public map, coarsened and delayed |
| Shifts change | Handover notes carry open questions from one shift to the next |
| Planning ahead | A scenario planner draws how far a fire could reach under the numbers a planner types |

Three roles, one application, one sign-in, one colour system and one logo. Languages: English, Hindi (हिन्दी), Odia (ଓଡ଼ିଆ). Light, dark and system themes. Installable on a phone.

---

## 2. The confidence ladder

Every fire claim sits on one of six rungs. Each rung has its own shape, colour and word, so meaning never depends on colour alone.

| Rung | Meaning | Who moves it here |
|---|---|---|
| Signal | A satellite sensor sees heat. No person has looked. | Automatic ingestion |
| Report | A person says there is a fire. Not checked. | A citizen, or staff logging a phone or radio report |
| Verified | Staff checked the evidence and agree it is real. | Control Room |
| Responding | An officer is on the way or on site. | Control Room, with the officer's acceptance |
| Contained | Under control. | Control Room |
| Closed | Finished, kept for the record, with a reason. | Control Room |

Closing always carries a reason: resolved, false alarm, duplicate, could not be verified, or other (with a note). The reporter sees the reason.

---

## 3. The three roles

### Citizen
- **Near me** – verified fire areas as coarse hexagons shown with a delay, official notices for the person's state, emergency contacts, and a permanent line: *nothing shown here does not mean there is no fire*.
- **Report** – pick the place on a map or type coordinates, say what was seen and when, add up to four photos. The text is kept on the phone and sent when the connection returns.
- **My reports** – each report with a step-by-step timeline from received to closed, and the reason it was closed.
- **Community** – three separate spaces: official Notices, Discussion (questions, local information, thanks, with replies and a single "Helpful" mark) and regional Chat rooms (short messages, slow mode, freeze, expiry). Phone numbers, links and coordinates in posts wait for a moderator. Posts never alert responders and every composer points to Report.
- **Account** – language and theme, download all personal data, close the account.
- Sign-in, registration with a privacy notice, and password reset.

### Range Officer
- **Tasks** – assignments grouped by what needs an answer; accept, or decline with a reason.
- **Task detail** – distance and direction from the officer's position (straight line, stated as such), open in the phone's navigation app.
- **Capture** – record an observation (fire confirmed, no fire found, could not tell) with notes and photos. Observations carry a retry key so a poor connection never creates duplicates, and are held on the device until sent.
- **Map** – the task, the officer's own position (taken only on tap), satellite signals within range of the task labelled *not confirmed*, and the wind now with its age. Scenario or spread outlines are never shown to officers, because a drawn boundary can be mistaken for safe ground.
- **Offline map** – the whole regional basemap can be saved on the phone and works without a network.
- **Me** – what is waiting to be sent, what the public was told, contacts.
- Finish field work once at least one observation is recorded.

### Control Room
- **Queue** – incidents grouped as needs a decision, active, contained, closed; oldest decision first; keyboard navigation (j, k, Enter). "Possibly the same event" suggestions group nearby reports and signals in space and time. They only suggest; nothing is merged or verified automatically.
- **Incident** – summary, evidence photos with human review (genuine, may be fake or edited, seen with no conclusion), field observations, full timeline, assign or reassign an officer, verify, mark responding or contained, close with a reason.
- **Log a report** – for reports arriving by phone, radio or a colleague.
- **Map** – one map with a role profile: incidents, reports, satellite signals, officers' notice areas, a time window (6, 24, 72 hours), source freshness chips, and a list view with the same items for people who cannot use a map.
- **Field** – open assignments, who accepted, who has not answered yet, what each officer recorded.
- **Notices** – official notices for the public (title, text, area, start, expiry, severity) written by one person and approved by a second; return with a reason; withdraw. A moderation queue for flagged and held community items, ordered by severity, with canned reasons, mute and warn; chat rooms with slow mode, pause and retention.
- **Handover** – shift notes, acknowledged by someone other than the author.
- **Scenario planner** (per incident, Control Room only) – head-fire rate of spread, wind speed and direction, hours to show, and uncertainty on each; nothing is pre-filled. Output is inner, typed and outer bands per hour, a straight-line reach table, a reality check against satellite signals, and exposure of places the planner adds. A scenario is marked outdated when an input or the wind reading changes. It is saved to the timeline as a note and never changes or notifies anything.
- **Alert rules and notifications** – a bell with the person's own notifications; rules choose which new reports notify them.
- **People and access** (administrators) – invite staff with a role and the states they cover, change states, make a password-reset link, deactivate or reactivate people, read access requests.

---

## 4. Maps

- **MapLibre GL** with a self-hosted **PMTiles** basemap (six states: Odisha, Chhattisgarh, Jharkhand, Madhya Pradesh, Maharashtra, Telangana), self-hosted fonts and icons. No third-party map requests are made.
- One map component with a **role profile**: each role can only enable the layers it is allowed, and the server refuses data a role may not read.
- Symbols are drawn per rung with distinct shapes: dashed diamond (signal), ring (report), filled disc (verified), double ring (responding), thick ring (contained), small dot (closed), square (officer), marked square (task), disc with halo (you).
- Public layer: verified incidents only, snapped to **H3** cells at a configured resolution and shown after a configured delay.
- Colour scales use ColorBrewer ramps for data layers.

### Who sees what

| | Citizen | Range Officer | Control Room |
|---|---|---|---|
| Verified incidents | Coarse hexagon, delayed | Exact, assigned and in scope | Exact, in scope |
| Unchecked reports | Own only, private | Own task only | All in scope |
| Satellite signals | No | Within range of the task, "not confirmed" | All in scope |
| Weather | Summary | Wind now | Wind, with age |
| Scenario | No | No | Per incident |
| Offline | Last view | Saved regional map | – |

---

## 5. Scenario engine

Pure TypeScript functions with golden tests, in `frontend/src/features/scenarios/engine/`.

- Anderson/Richards elliptical fire growth. Length-to-breadth from the Anderson relation with wind in m/s; head-to-back ratio from the ellipse eccentricity.
- The head-fire rate of spread is a required input with no default.
- Nested envelopes over a wind schedule; uncertainty bands from the eight corner perturbations of wind speed, direction and rate.
- Reality check (observations against the outer band), exposure (earliest hour a place falls in the outer and inner bands), and validation helpers.
- Wording never says what *will* burn; it states a range under stated inputs.

---

## 6. Data sources

| Source | Use |
|---|---|
| NASA FIRMS (VIIRS) | Satellite detections, ingested on a schedule and stored as signals |
| Copernicus ERA5 / weather source | Wind and weather context with the age of the reading |
| OpenStreetMap contributors, Protomaps | Basemap |
| Citizen reports and field observations | Evidence and verification |

Every data chip shows its age; a source over its configured limit turns grey and says *stale*. Archived outputs are never presented as live.

---

## 7. Fire Evidence Assessor

A separate component that examines evidence photos attached to reports.

- Produces an experimental, uncalibrated assessment for a photo.
- Always labelled advisory: *experimental, not for operational use*. A person decides; the assessment never changes an incident's status.
- Control Room reviewers record their own judgement of each photo (genuine, may be fake or edited, seen with no conclusion, or cleared).
- Inference is controlled by a server switch and, when off, photos are shown as *assessment unavailable*.

---

## 8. Architecture

```
Browser / installed app (React 19, Vite, Tailwind 4, MapLibre, TanStack Query, react-router)
        │  HTTPS, bearer access token (15 min) + HttpOnly refresh cookie + CSRF header
        ▼
FastAPI backend ── services (alerts, escalation, community rules, feeds, mailer)
        │
        ▼
PostgreSQL (SQLAlchemy / psycopg3), optional PostGIS
```

### Backend
- FastAPI with routers per area (auth, citizen, workflow, operations, community) and auto-discovered extension packages: `schemas_ext/*` (idempotent schema setup) and `routers_ext/*` (notices, public map, feeds, handover, ops settings, scenarios, admin, inbox).
- Schema setup is serialised with an advisory lock and a fingerprint, so several workers can start together.
- Authentication: argon2 password hashes; one sign-in endpoint for all roles; refresh-token rotation with reuse detection; lockout after repeated failures; CSRF double-submit on every state-changing call; a deactivated person is refused at once.
- Authorization: role checks plus **state scopes** per staff member; every query for staff data is scoped; denials are audited.
- Idempotency keys on citizen reports and officer observations.
- An audit log records sign-ins, status changes, assignments, reviews, notices, moderation, administration and scenario notes.

### Frontend
- Feature folders: `auth`, `landing`, `citizen`, `field`, `ops`, `community`, `incidents`, `map`, `scenarios`, `system`.
- Shared UI in `ui/`: app shell with role navigation (bottom bar on phones with a raised primary action, left rail for the Control Room on desktop), buttons, fields, notices, ladder badge, language and theme menus, notification bell, update prompt.
- Screens load when first opened; the map code loads only with a map.
- Internationalisation with i18next; flat Hindi and Odia tables plus hand-written core text.
- Offline: a service worker keeps the app shell and screen files ready, queues citizen reports and officer observations, serves the saved regional map in range requests, never stores private pages or API answers, and waits for the person to choose when to reload for an update.

---

## 9. Design system

- **Palette** – hand-picked and named: Bone, Paper, Ash, Dust, Char, Ember, Signal red, Turmeric, Sal, Neel. Ember is the brand accent only. Colours are generated into CSS variables and design tokens (W3C format) by a script that fails if contrast or colour-blind checks break.
- **Colour meaning** – Neel (blue-violet) means *not confirmed by a person*; red and turmeric mean hazard; Sal (green) means contained.
- **Type** – Noto Sans with Devanagari and Odia coverage, self-hosted.
- **Logo** – two contour peaks around a watch point, drawn inline so it follows the theme.
- **Open-source tools** – Radix UI, Lucide icons, Motion, colorjs.io, h3-js, MapLibre GL, PMTiles, Protomaps basemaps, axe-core, Playwright.
- **Accessibility** – keyboard use throughout, visible focus, 44 px touch targets, live regions for status, reduced-motion support, automated axe checks in light and dark on every area.

---

## 10. Safety and privacy rules

- A missing dot on a map is not evidence there is no fire; every public view says so.
- Citizens never receive satellite signals, unchecked reports, scenarios, or other people's reports. Range Officers never receive scenarios.
- The public map shows verified incidents only, coarsened, delayed, and enforced on the server from required configuration.
- No emergency numbers, retention periods or thresholds are built in; they come only from configuration, and a feature without its configuration stays off and says so.
- Nothing automatic merges, verifies, closes or announces; AI output is advisory and labelled.
- Official notices need a second person's approval.
- Citizens can download or delete their data; deleted accounts are anonymised and their posts removed.
- Passwords follow one policy for everyone. Secrets are never printed or committed.

---

## 11. Configuration

All settings are environment variables; see `docs/operations/CONFIGURATION.md`. Policy values (emergency contacts, public map resolution and delay, corroboration radius and window, exposure radii, escalation interval, community windows, feature switches) have no defaults. Email (SMTP), data-feed keys (FIRMS, CDS) and the front-end API address are set the same way.

Scheduled commands: feed ingestion, report escalation, chat retention purge.

---

## 12. Repository map

```
backend/
  app/routers/        auth, citizen, workflow, operations, community
  app/routers_ext/    notices, public, feeds, handover, ops_settings, scenarios, admin, inbox
  app/schemas_ext/    idempotent schema setup per feature
  app/services/       alerts, escalation, recipients, mailer, password policy, community rules, feeds, H3
  scripts/            create_admin, ingest_feeds, escalate_reports, purge_chat, smoke_firms
  tests/              real-PostgreSQL tests per feature
frontend/
  src/features/       auth, landing, citizen, field, ops, community, incidents, map, scenarios, system
  src/ui/             shell, components, i18n, theme, palette
  public/             brand, map fonts and icons, offline basemap, manifest, service worker
  scripts/            palette, brand, map assets, post-build, size budgets, translation report
  tests/              Playwright specs per area
docs/
  design/             D0–D5 design documents, decisions log, status
  operations/         configuration reference
```

## 13. Quality checks

- Backend: pytest against a real PostgreSQL database.
- Front end: unit tests (node), type check, production build, size budgets, translation report, Playwright browser tests with axe accessibility checks in light and dark, and offline/service-worker tests against the production build.
