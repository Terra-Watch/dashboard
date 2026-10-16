# D2 — Map, simulation, role features, community, report routing, AI-assisted reports

> **SUPERSEDED in part by D3 (clean-sheet design).** Sections 1 (map), 2 (simulation), 3 (role features), 8 (PWA) and 9 (landing) are scrapped; use D3. Sections 4–6 (community, report routing, AI-assisted drafts) remain as domain rules.

Status: design for approval-free implementation under decisions D-15 to D-19. Nothing here invents data, numbers or policies; every unconfirmed value is a configuration setting.

## 1. One Fire Map

**Problem.** Today there are separate map screens per role, third-party glyph/sprite fetches, no legend that explains colour, risk fills below 3:1 contrast, no time control and no statement of data freshness.

**Design.** One map component, one style, role-based layers.

| Layer | Citizen | Control Room | Range Officer | Source / rule |
|---|---|---|---|---|
| Verified incidents (public form) | yes, coarsened and delayed (D-14) | exact | assigned only, exact | `/api/public/incidents` vs staff endpoints |
| All reports incl. unverified | no | yes, in scope | assigned only | server-side scope |
| Satellite detections (VIIRS) | yes, labelled "satellite detection, not a confirmed fire" | yes | yes | NASA FIRMS, key `FIRMS_MAP_KEY` |
| Weather context (ERA5) | summary text only | layer + chart | summary | Copernicus CDS, keys `CDSAPI_*` |
| Fire-risk index | yes | yes | yes | existing risk service, shown with outline + label |
| Assignments and last positions | no | yes | own | workflow tables |
| Spread scenario | no | switch, off by default | no | see section 2 |
| Boundaries, roads, water | when tiles exist | yes | yes | self-hosted PMTiles; layer says "unavailable" otherwise |

Rules:
- Every layer shows **source, acquired-at and age**; older than a configured limit becomes "stale" with a grey treatment, never hidden silently.
- Colour is never the only carrier: every fill has an outline and a pattern/label (UX-07). Legend is always visible and keyboard reachable.
- Time control: "last 6 h / 24 h / 72 h" for detections and incidents. No scrubbing of unvalidated forecasts.
- Self-host glyphs and sprites (UX-08); no third-party tile or font requests.
- Offline: last successful snapshot of the viewer's own layers is cached and labelled "saved at <time>" (Range Officer first).
- Accessibility: list view of the same features (table) beside the map; map is not the only way to read an incident.
- Performance: cluster above a configured count; request only the viewport bounding box.

**Data feeds.** FIRMS ingestion primitives already exist (`services/ingest.py`). The feed runs as a scheduled job (Procrastinate or a cron in dev), stores detections with `satellite`, `acq_datetime`, `confidence`, `frp`, and exposes `GET /api/hotspots?bbox&since` (read-only, scoped by role; public form coarsened). ERA5 is fetched per region and cached per day into a `weather_context` table (`temperature_2m`, `wind_speed_10m`, `wind_direction`, `relative_humidity`, `valid_time`). Credentials are read from the environment only; a missing key makes the layer report "not connected".

## 2. Simulation (scenario tool)

Purpose: help the Control Room think through "what if the fire keeps spreading with this wind", not to predict. It stays off by default (D-07, `SIMULATION_ENABLED`).

- Control Room only. Not shown to citizens (a citizen is helped by the verified status, advisories and safety guidance — not by an unvalidated spread picture).
- Inputs are visible and editable: ignition point (from an incident), wind (from ERA5 or manual), fuel/terrain source, duration. The result card lists inputs, the model, run time and the sentence "Scenario from the inputs above; not a forecast and not validated."
- Output is a time-sliced polygon set on the map using the scenario layer style (dashed outline, own legend entry), plus an exportable summary for a briefing. It never changes incident status, assignments or alerts.
- States: idle, queued, running (progress), done, failed (reason), stale (inputs changed). Cancel supported. History list of past runs with their inputs.

## 3. Features missing per role

**Citizen**
1. My reports timeline: submitted, received by Control Room, verified, responding, contained, closed with reason (D-10), each with time.
2. Safety guidance page by situation (smoke, evacuation notice, livestock); text is staff-authored content, versioned.
3. Emergency contacts (config only, D-02) with one-tap call.
4. Notification preferences: report updates always on; announcements by region on/off.
5. Add a photo/location to an existing report; withdraw a report within a short window (before verification).
6. Language: English, Hindi, Odia (Noto fonts), chosen once.

**Control Room**
1. Triage board: new, awaiting verification, awaiting Ranger, in field, contained — with age and who owns it; keyboard-driven.
2. Duplicate merge: link a report to another incident with reason `duplicate`.
3. Shift handover note: open items, assumptions, who is on duty.
4. Announcement composer with approval (Task 8).
5. Evidence review (done) and close with reason (done).
6. Escalation: unacknowledged new report after a configured time re-notifies the lead.
7. AI-assisted report draft (section 6).

**Range Officer**
1. Offline task pack: assigned incidents, last map snapshot, checklist; sync status per item.
2. Field checklist per incident type; observations can be added many times; explicit "complete field work" (done).
3. Last-known position share (opt-in per assignment; stops at completion).
4. Quick call to Control Room (config).
5. Decline with reason (done) and "need support" request.

## 4. Community and posting

Community is a Citizen feature (D-03: sign-in required). It is separate from incident reporting: a post never notifies responders; the composer says so and links to "Report a fire" instead.

**Spaces.** (a) Posts: slower, longer, searchable, threaded comments. (b) Regional chat: short, live-ish, per region room. Not mixed.

**Post types.** Question, information (e.g. road closed — marked "unverified community info"), and thanks. No location pin on public posts; place is a free-text region name. Photos are out of scope until moderation tooling exists.

**Composer.** Title optional, body 1–2000, region, type; live character count; preview; clear note "Do not post emergencies here — report a fire"; one-tap switch to the report flow.

**Thread.** Comments flat with reply-to, newest/oldest toggle, "author", "staff" and "official" badges. Official replies come only from approved announcements.

**Author controls.** Edit within 15 minutes (shows "edited"), delete any time (soft state `removed_by_author` kept for moderation 30 days — setting), no silent edits after the window.

**Safety.** Report/flag with reason (spam, unsafe advice, harassment, misinformation, other); rate limits per user; staff moderation queue with action + reason (remove, restore, warn); moderation log visible to staff; removed content shows "removed by moderator: <reason>" to its author.

**Quality states.** Loading skeleton, empty ("Be the first to ask"), error with retry, offline read-only with saved copy, slow-mode notice at 429.

**Polling.** Chat refresh every 15 s with back-off, paused when the tab is hidden; later move to server-sent events.

## 5. Routing a citizen report to the right people

1. Citizen submits (idempotent client key) → incident `reported`, state/region from location.
2. Recipients: administrators plus staff whose scope covers the state (implemented, `services/recipients.py`; no state ⇒ administrators only).
3. Control Room verifies (or closes with reason). Citizen is notified of each change.
4. Control Room assigns a Range Officer from the incident's region → Officer is notified; accept/decline with reason; decline notifies the region again.
5. Escalation: unacknowledged `reported` incidents notify the lead after the configured interval; unaccepted assignments are flagged on the triage board.
6. Neighbouring-region notice is a Control Room decision (announcement with approval), never automatic.
7. Nothing is sent to the public from a single report; public output is the coarsened, delayed verified-only feed (D-14).

## 6. AI-assisted report (staff-only draft)

- Where: incident page → "Draft situation report".
- Input is limited to **verified facts already in the system**: report text, observations (with outcomes), timeline, human-reviewed photo statuses, assignments, weather context. Unreviewed photo-check outputs and unvalidated forecasts are excluded.
- Output: a structured draft (what was reported, what was observed, current status, open questions, recommended next checks). Each sentence carries a reference to the record it came from; sentences without a source are not allowed.
- Always labelled "Draft — not reviewed". An editor must edit or accept, then a second step "Approve for record" (author ≠ approver when two staff are on duty; a single-person override is audited).
- Approved text is stored as a revision; it can be exported for briefings. It is never sent to citizens or the public automatically; publication goes through the announcement approval flow (Task 8).
- Provider is configurable; with none configured the button is absent. Prompts and outputs are logged for audit without personal data. This stays behind the `AI_REPORT_DRAFTS` switch (default off) until a human review of sample drafts is recorded.

## 10. Implementation order

Done: evidence review, lifecycle, closure reasons, scoped notifications. Next: colour system, emergency contacts, community controls, announcements, public map policy, single login, then map layers and feeds, report-routing escalation, AI draft behind its switch. Any item that needs a decision not in `decisions.md` becomes a configuration value, not a guess.

## 8. PWA on phones

Field and citizen use is mostly on phones with weak networks, so the PWA is a first-class target, not an add-on.

- **Install:** valid manifest (name, short name, theme/background from tokens, maskable icons 192/512, `display: standalone`, start URL by role after login), install prompt shown only after a useful action, never on first load.
- **Offline:** a precached app shell and an explicit offline page that says what still works (saved tasks, saved map snapshot, drafts) and what does not. Drafts and observations queue in IndexedDB and show per-item sync state (queued, sending, sent, failed with retry). Nothing is shown as sent until the server confirms it.
- **Updates:** new version is announced with "Update available — reload" and never swaps under an open form.
- **Phone layout:** single column below 640 px, bottom navigation with 3–4 items per role, 44×44 px minimum targets, safe-area insets, no hover-only controls, sticky primary action on forms, system back button returns to the previous step (not out of the app), text scales to 200 %.
- **Capabilities:** camera capture for evidence (`capture=environment`), geolocation by explicit tap with accuracy shown, tap-to-call for configured emergency numbers, share-sheet for the public incident link. Push notifications only after a clear opt-in and only for report updates and approved announcements; until the web-push service is configured the UI says "in-app notifications only".
- **Performance budgets:** first load under 200 KB of JavaScript for the landing route (map code loaded only on map routes), largest contentful paint under 2.5 s on a mid-range phone over 4G in Lighthouse CI, map tiles cached with a size cap.
- **Data use:** images resized client-side before upload (long edge configured), uploads resumable and retried with back-off, low-data mode that disables auto-refresh.
- **Checks:** Lighthouse PWA + accessibility in CI, Playwright mobile viewport specs for each role, offline-mode spec that blocks the network.

## 9. Landing page

**Purpose (clarified): the landing page presents the product's features**, grouped by who uses them, so a visitor understands what TerraWatch does before signing in. A feature is listed only when it works in the product today; planned items are not shown. Community appears here only as one described Citizen feature ("Ask and share locally, signed in"), never as a navigation link or a live feed.

| Section | Features shown (each: icon, one line, what you need) |
|---|---|
| For citizens | Report a suspected fire with place, time and photos · Follow your report from received to closed, with the reason · Safety guidance and emergency contacts · Fire map of verified incidents (when published) · Local discussion with moderation |
| For the Control Room | Triage board with region scope · Evidence review with human decision · Assign Range Officers and track acceptance · Closure with structured reasons · Approved announcements · Situation drafts for staff |
| For Range Officers | Assigned tasks on the phone · Works offline, syncs when back · Observations and photo evidence · Explicit completion · Decline with reason |
| Across the product | Human review before any status change · Region-scoped access · Audit trail · English, Hindi and Odia · Installable on phones |


One landing page for everyone (`/`), calm and honest:
1. **Top:** what TerraWatch does in one sentence, one primary action ("Report a fire") and one secondary ("Sign in").
2. **Safety strip:** configured emergency numbers (if set) and "If anyone is in danger, call emergency services first."
3. **Live status block:** verified incidents count and last update from the public feed (coarsened and delayed per policy); when the feed is unavailable or not yet approved it says "Public map data is not available yet" rather than showing numbers.
4. **How it works:** report → verified by staff → responders act → you get updates (4 steps, with the human-review promise).
5. **Roles:** Citizen, Control Room, Range Officer cards leading to the single sign-in; staff cards say staff accounts are issued by an administrator.
6. **Trust:** what is public, what is private (precise locations and unverified reports are never public), how to request deletion of your data.
7. **Footer:** language switch (English, Hindi, Odia), accessibility statement, contact (configured), data sources with attribution (NASA FIRMS, Copernicus ERA5, OpenStreetMap/Protomaps as applicable).
Community is **not** on the landing page and not in the public navigation: it is a signed-in Citizen feature (D-03, D-22), reached from the Citizen app menu. The landing page links only to: Report a fire, Sign in, Safety information, and the public map once approved. The saved-example archive and any "demonstration" wording are removed from public screens.
Non-goals: no marketing numbers, no unverifiable claims, no autoplay motion; motion respects `prefers-reduced-motion`.
