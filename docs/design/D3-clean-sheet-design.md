# D3 — Clean-sheet design (replaces every earlier visual or structural proposal)

**Status:** authoritative. It was derived from what people need to do and from the incident information model, not from the existing screens. Earlier documents keep their *findings* (D1, the audit of what is broken) but their *proposals* are scrapped: D2 sections 1 (map), 2 (simulation), 3 (role features), 8 (PWA), 9 (landing) and the "keep green and logo" decision D-05 are superseded by this document. The community, routing and AI-draft domain rules in D2 sections 4–6 are re-stated here only where this design changes them.

Rule for the whole product: **one** visual language, **one** sign-in, **one** map, **one** component set, three roles.

---

## 1. Start from the situation, not the screens

A forest fire is a *claim that gets more certain over time*. The product exists to move a claim up that ladder quickly and safely, and to tell everyone how sure we are.

**The confidence ladder (the spine of the whole UI)**

| Rung | Meaning | Who/what produced it | How it looks everywhere |
|---|---|---|---|
| 1 Signal | A satellite saw heat, or the outlook is high | NASA FIRMS (VIIRS), outlook model | violet, dashed outline, label "Satellite signal · 38 min ago" |
| 2 Report | A person says they saw smoke or fire | Citizen report | violet, solid outline, "Reported · not yet checked" |
| 3 Verified | Staff checked it and agree it is real | Control Room decision | red/amber by severity, solid fill, "Verified" |
| 4 On the ground | A Range Officer is there or has observed it | Field observation | adds a field marker and time-stamped notes |
| 5 Contained / Closed | Under control, or finished with a reason | Staff decision | green (contained) or grey (closed), reason shown |

Every card, marker, list row and notification shows its rung (icon + word) and its age. Nothing climbs a rung by itself; only a person moves it (human review stays mandatory).

**Meaning of colour (never decoration):** blue = something you can act on · red/amber = confirmed hazard, by severity · green = contained or safe · violet = not yet confirmed by a person · grey = history. Colour is never the only carrier: each meaning also has its own icon and word.

## 2. Who, where, doing what

| | Citizen | Control Room | Range Officer |
|---|---|---|---|
| Where | Phone, patchy network, sometimes frightened | Desk, large screen, long shifts, often night | Phone outdoors, glare, gloves, offline |
| Question they bring | "Is it safe near me? What do I do? Did anyone see my report?" | "What needs me first? What do we know? Who is on it?" | "What is my task? Where? What do I record?" |
| Time on task | seconds to minutes | hours | minutes between tasks |
| Cost of a wrong tap | high (panic, wrong info) | very high (wrong status) | high (lost evidence) |

Jobs ranked by frequency and cost (these decide the navigation):
- **Citizen:** (1) see what is happening near me, (2) report, (3) follow my report, (4) learn what to do, (5) talk with neighbours (community), (6) my account.
- **Control Room:** (1) triage the queue, (2) see the whole picture on the map, (3) work one incident, (4) direct field staff, (5) tell the public (announcements), (6) look after the community, (7) hand over the shift, (8) explore scenarios (optional).
- **Range Officer:** (1) my tasks, (2) record an observation or photo, (3) find the place, (4) finish or hand back a task, (5) see sync state.

## 3. Navigation (what the bar contains, and why)

Rules: at most five destinations per role; the same names everywhere; the primary action is always reachable with one thumb or one click; the current place is marked by icon, word and shape (not colour alone); no destination exists unless a job above needs it.

**Citizen (phone: bottom bar of five; desktop: top bar)**
1. **Near me** — status and safety near my place, the verified map, safety guidance.
2. **Report** — centre button, always visible, starts the report in two taps.
3. **My reports** — each report as a timeline.
4. **Community** — discussion and chat (signed-in).
5. **Account** — profile, language, notifications, privacy (export, delete), emergency contacts, sign out.

**Control Room (desktop: left rail of icons + words; top bar for context)**
1. **Queue** — triage board, oldest and most severe first (home).
2. **Map** — whole-region picture.
3. **Field** — Range Officers, assignments, acceptance, last positions (opt-in).
4. **Notices** — announcements with approval, and community moderation.
5. **Handover** — shift notes, open items. Scenarios sit *inside an incident* (not in the bar). Administrators additionally see **People** (accounts, invitations) under Account.
Top bar: region switcher (scope), global search, data freshness chip ("Satellite 12 min · Weather 1 h"), notifications, the person menu.

**Range Officer (phone: bottom bar of four)**
1. **Tasks** — today's assignments (home).
2. **Map** — my task and route to it.
3. **Capture** — centre button: observation or photo for the current task.
4. **Me** — sync status, offline pack, language, contacts, sign out.

Shared chrome: skip link, language switch (English, हिन्दी, ଓଡ଼ିଆ), connection chip (Online / Offline · n waiting), install prompt only after a useful action.

## 4. Incident = the one object

Everything attaches to an **incident case** with a single timeline. Citizens see a plain-language version, the Control Room sees all, the Range Officer sees the task slice.

Case sections (Control Room): Summary (rung, severity, place, age, owner) · Timeline (every event, who, when) · Evidence (photos with human review) · Field (assignments, observations) · Messages (notices tied to it) · Scenario (optional) · Close (structured reason). One component renders the timeline for all three roles with role-specific detail.

## 5. Visual language (derived, then checked by script)

- **Principles:** calm, legible in sunlight, honest about certainty, quiet chrome so map data is what stands out, dense only where the Control Room needs it.
- **Colour: hand-picked and named, then checked by script (not generated).** Warm **Bone / Paper / Ash / Dust** neutrals and **Char** (charcoal) text and buttons make a quiet, instrument-like interface so map data is what stands out. **Ember** is the glowing watch point in the logo and a brand accent only, never a control colour. Meaning colours: **Signal red** (confirmed hazard), **Turmeric** (caution), **Sal green** (contained, after the forest tree), **Neel** (indigo dye: "not yet confirmed by a person"). Data scales are **ColorBrewer** YlOrRd (outlook) and Blues (probability), peer-reviewed and colour-blind-safe. Light and dark themes, following the system setting, user-overridable. `scripts/palette.mjs` (colorjs.io) fails the build if text is under 4.5:1, controls or focus rings under 3:1, or any meaning colours are near-identical under protan/deutan/tritan simulation; tokens are exported as W3C design-tokens JSON for Penpot and Style Dictionary.
- **No gradients, no glow, no purple-blue "tech" look.** Flat fills, thin borders, one accent.
- **Type:** Noto Sans Variable (Latin) with Noto Sans Devanagari and Oriya, self-hosted (fontsource, OFL). One family, no serif. Scale 12/14/16/18/22/28/36; body never below 16 px on phones; tabular numerals for times and counts.
- **Space and shape:** 4 px grid; radius 6 (controls) and 10 (panels); borders over shadows; shadow only on floating layers.
- **Icons:** Lucide (ISC), 20 px, 1.75 stroke, always with a word beside them in navigation.
- **Motion:** functional only (panel 160 ms, sheet 200 ms), none for decoration, all off under `prefers-reduced-motion`.
- **Components:** Radix primitives (MIT) for dialog, tabs, menu, tooltip give correct keyboard and screen-reader behaviour; our own styling on top; documented in Storybook (MIT) once the set is stable.
- **Logo:** section 10.

## 6. The map (clean sheet)

Purpose: answer four questions at a glance — **where, how sure, how old, what is being done.**

- **Structure:** full-bleed map. Left: a *scope bar* (region, time window 6 h / 24 h / 72 h) and **three presets instead of a layer checklist**: *Situation* (default: signals, reports, verified incidents, field), *Outlook* (risk scale with weather summary), *Field* (my tasks and route). Advanced layer toggles sit behind "More layers". Right: detail panel (bottom sheet on phones) for the selected thing. A **list view of the same data** is one tap away and is the default on phones with poor networks.
- **Basemap:** muted greyscale terrain with faint forest tint; roads and labels low-contrast. Self-hosted PMTiles, glyphs and sprites (no third-party requests). Data is the only saturated thing on screen.
- **Symbols by rung (shape + colour + label, so it works in greyscale):**
  - Satellite signal: violet diamond, size and opacity fall with age; dashed ring.
  - Report: violet circle, hollow.
  - Verified incident: filled circle in severity colour with a number badge; pulsing ring only while "responding", not under reduced motion.
  - Field officer: square with initials; contained incident: green filled ring; closed: small grey dot.
  - Outlook cells: five-step scale with a thin outline and a legend that shows the number and word.
- **Always visible:** legend (collapsible), scale, north, "Data as of" chip per source with age; stale sources turn grey with the word "stale".
- **Honesty rules:** unverified items are never styled like verified ones; public view shows only verified, coarsened and delayed incidents (policy endpoint); precise field locations never leave staff views.
- **Interaction:** pan/zoom, search a place, tap a thing → panel; keyboard equivalents for every map action; the list and the map select the same item; shareable link keeps view, scope and selection.
- **Open source:** MapLibre GL JS, PMTiles/Protomaps, Maputnik for style editing, OpenStreetMap-derived data (ODbL, attributed).


### 6a. Map capability set (what "enough" means)

| Capability | Why it matters | Open-source tool (licence) |
|---|---|---|
| Terrain: hillshade, contour lines, slope shading | Fire runs uphill; staff and officers must read terrain | MapLibre terrain + hillshade, `maplibre-contour` (MIT) from open DEM tiles (Copernicus DEM / SRTM) |
| Satellite signals with age | Core early-warning layer | NASA FIRMS (VIIRS) via our backend; drawn by MapLibre |
| Clustering and density | Many signals must stay readable | Supercluster (ISC), deck.gl HeatmapLayer (MIT) for density view |
| Privacy by design | Public view must be coarse | **H3 hexagons** (h3-js, Apache-2.0): public incidents snap to a configured H3 resolution; the same cells aggregate the outlook |
| Distance, buffers, area, bearing | "Which villages are within 3 km of this?" | Turf.js (MIT) |
| Place and village search | Find where a report is | Nominatim / Photon (ODbL) through a configurable endpoint, so it can be self-hosted |
| Draw an area of interest | Region scope, evacuation sketch, patrol area | Terra Draw (MIT) |
| Wind and weather context | Context for every decision | Wind arrows layer (deck.gl IconLayer); ERA5 history (Copernicus CDS), forecast winds from Open-Meteo (open data, configurable) |
| Land cover | Fuel context | ESA WorldCover (CC-BY 4.0) as tiles |
| Roads, villages, water, boundaries | Access and exposure | OpenStreetMap-derived vector tiles built with Planetiler (Apache-2.0) into **PMTiles**, self-hosted |
| Offline | Range Officers in the forest | PMTiles region extract + service-worker cache, with a "saved on this phone" indicator and size cap |
| Measure and coordinates | Field use | Distance/area tool, copy coordinates (decimal and DMS), open in the phone's navigation app |
| Share and print | Briefings | Permalink with view, scope and selection; print/PDF map sheet with legend and data freshness |
| Accessibility | Not everyone can use a map | List view with the same items, keyboard map controls, text description of the current view |


## 7. Scenario planner (replaces "simulation")

It answers one question: **"If conditions are like this, what could this fire reach, and by when?"** It never predicts and never changes an incident.

- Opens from an incident (**Scenario** tab); Control Room only; off unless enabled.
- **Inputs, as plain controls with units:** start point (the incident), wind direction and speed (from ERA5 or typed), duration, fuel/terrain source shown by name. Presets such as "Wind turns 90° at 15:00" are saved scenarios, not code.
- **Output:** reach envelopes at 1, 3, 6, 12 h drawn as stacked outlines (hatched violet = not a confirmed fact), a list of villages, forest blocks and roads inside each envelope, and one sentence of limits. Slider scrubs time; two scenarios can be compared side by side.
- **Record:** "Add to briefing" writes inputs and results to the incident timeline as a *scenario note* (rung-neutral).
- **States:** idle → queued → running (progress, cancel) → done / failed (reason) / outdated (inputs changed).
- Not shown to citizens: they are helped by verified status, advisories and guidance instead.

### 7a. Scenario planner capability set

| Capability | Detail | Tool |
|---|---|---|
| Spread-envelope engine | Elliptical growth from a start point using head-fire rate of spread, wind speed and direction, and slope (Anderson 1983 length-to-breadth ratio; Richards ellipse). The head-fire rate of spread is entered by the officer with no default, so no number is invented; the result shows the formula and inputs. This is a planning aid, not a validated forecast. | Turf.js (geometry), our own tested pure functions |
| High-fidelity run | Existing Cell2Fire run on the backend for the same inputs, queued, with progress, cancel and result polygons; shown beside the quick envelope so the difference is visible | Cell2Fire (GPL-2) via backend job queue (Procrastinate, BSD) |
| Wind controls | Wind rose control (drag direction, type speed), hour-by-hour wind table from forecast or typed, "wind shifts at HH:MM" step | d3 (ISC) for the rose and charts |
| Time slider | 1–24 h scrubber, envelopes drawn as stacked outlines, play/pause, step | deck.gl PolygonLayer + MapLibre |
| What is at risk | Villages, roads, water points and forest blocks inside each envelope, with arrival-time ranges | Turf.js against the OSM tiles |
| Compare | Two scenarios side by side or overlaid with a difference readout | d3, deck.gl |
| Uncertainty | Wind ±, rate ±, drawn as inner/outer envelope bands, never a single crisp line | our functions |
| Record | "Add to briefing" stores inputs + results as a scenario note on the incident timeline (not a fact, never changes status) | backend timeline |
| Export | PNG of the map with legend, JSON of inputs, CSV of at-risk list | html-to-image (MIT), native download |
| Validation | A validation page shows the engine against published test cases and any reference fires staff add; the planner stays labelled "not validated" until that record exists | Vitest golden tests |

## 8. Sign-in (one door)

- One page `/login` for everyone. No role chooser: the account decides where you land (Citizen → Near me, Range Officer → Tasks, Control Room → Queue).
- Form: email, password with show/hide, "Keep me signed in on this device" (off on shared devices), clear errors in words ("That email or password is not right" — never which one), lockout message with time left.
- Beneath: **Create a Citizen account** (name, email, password with live rule checker, privacy consent recorded), **Forgot password** (works only when email delivery is configured; says so honestly otherwise). Staff text: "Staff accounts are created by an administrator."
- Phone-first: one column, 48 px fields, correct `autocomplete`/`inputmode`, no placeholder-as-label, works with password managers; passkeys (WebAuthn) are the planned next step.
- Desktop: the form beside a short statement of what TerraWatch is and the current service status; no decorative background.
- Security carried over from the backend work: argon2, lockout, CSRF, HttpOnly refresh cookie, reset ends all sessions, password policy (10+, not common, not the email).

## 9. Landing page (presents the product's features)

Order: (1) one sentence of what TerraWatch does, **Report a fire** and **Sign in**; (2) an honest status line (verified incidents, source freshness — or "Public map data is not available yet"); (3) **What you can do**, by role, each feature one line with an icon, only shipped features; (4) **How a report is handled**: the confidence ladder as a five-step diagram; (5) **What is public and what is private**; (6) language switch, accessibility statement, data sources and credits, contact. No community link, no "demo" wording, no invented numbers, no autoplay motion. Weight under 200 KB of script; works offline as a cached page.

**The landing page is the product introduction, so it is interactive** (built with Motion, Radix Tabs and the real product components; every animation has a still, keyboard-operable equivalent and stops under reduced motion):
1. **Follow a report:** a "Play" control walks a sample report up the confidence ladder rung by rung (signal → reported → verified → responding → contained → closed); clicking any rung shows who acts, what they see, and what the public sees at that point. Marked as an illustration.
2. **Explore by role:** tabs for Citizen / Control Room / Range Officer; each shows its real navigation (rendered from the same `nav.ts`) in a phone or desktop frame, and clicking an item explains that screen's job.
3. **Public or private?** a switch between "What the public sees" and "What staff see" on a schematic map: unverified reports disappear, precise points snap to coarse hexagons, delays are shown.
4. **How we handle your data:** expandable answers (what is stored, who sees it, how to delete).
5. **Scroll story:** report → check → respond → close, each step coming into view with a short line.
No fabricated live data; the status line reads the real public feed or says it is not available.

## 10. Logo

Concept: *a watch point on the land under the contour of a peak* — a first attempt with half-rings read as a Wi-Fi symbol and a second with concentric loops read as a target, so both were dropped. Nested peaks read as terrain, and the glowing dot as the thing being watched; it holds at 16 px.
- Mark: two nested contour peaks (terrain) around a glowing watch point (Ember). Charcoal on light, bone on dark; the dot is the only colour.
- Lockup: mark + "Terra" (500) "Watch" (800) in Char. Clear space = dot diameter × 2. App icon: Char tile, bone mark, ember dot.
- Files: `logo-mark.svg`, `logo.svg` (lockup), `logo-mono.svg`, `favicon.svg`, PWA icons 192/512 and maskable 512 generated from the SVG, Open Graph image.

## 11. Open-source toolchain and how each is used

| Need | Tool (licence) | Use |
|---|---|---|
| Colour science | colorjs.io (MIT) | generate and verify the palette |
| Design tokens | W3C DTCG JSON + Style Dictionary (Apache-2.0) / Penpot (MPL-2.0) | token hand-off and design files |
| Design and prototype | Penpot, Excalidraw (MIT) | wireframes and flows in the open |
| Icons | Lucide (ISC) | all icons |
| Accessible primitives | Radix UI (MIT) | dialog, menu, tabs, tooltip |
| Fonts | Noto Sans Variable/Devanagari/Oriya (OFL) | all text |
| Components workshop | Storybook (MIT) | states and docs |
| Map | MapLibre GL (BSD-3), PMTiles/Protomaps, Maputnik | map and style |
| Accessibility checks | axe-core + Playwright (MPL/Apache) | CI on every screen and viewport |
| Performance | Lighthouse CI (Apache-2.0) | budgets on landing, map, task list |
| Motion | Motion for React (MIT, the engine behind Framer Motion) | landing page storytelling, panel and sheet transitions, all off under reduced-motion |
| Geospatial | Turf.js, H3, Supercluster, deck.gl, Terra Draw, maplibre-contour | see 6a and 7a |
| Charts | d3 (ISC) | wind rose, timelines |
| Routing, i18n | React Router (MIT), i18next (MIT) | navigation and English/Hindi/Odia |
| Colour tests | custom scripts in `scripts/` | palette and hex lint |

## 12. Build order (each step ships with tests)

1. Tokens and fonts (done: palette script, generated tokens). Wire into the app and remove old colour tokens.
2. Logo and app shell: shared shell with the three role navigations, connection chip, language switch.
3. Sign-in and landing page.
4. Citizen: Near me, Report, My reports (timeline), Account.
5. Range Officer: Tasks, Task detail, Capture, offline pack.
6. Control Room: Queue, Incident case, Field, Notices, Handover.
7. Map and Scenario planner.
8. Remove the old screens and styles once each is covered (deferred patrol-planning code stays, behind its flag).
9. PWA hardening, Lighthouse and axe budgets, Storybook.

## 13. Acceptance checks (automated where possible)

- Palette script passes (contrast, colour-blind).
- No hard-coded colour outside the generated tokens (lint).
- axe finds no serious or critical issue on any route at 360×640 and 1280×800, light and dark.
- Every destination in section 3 is reachable by keyboard and by touch with 44 px targets; the primary action is reachable in two actions.
- Map: every symbol meaning is distinguishable in greyscale; legend present; list view lists the same items.
- No screen uses the words "demo" or "experiment"; no unvalidated output is shown as fact.
