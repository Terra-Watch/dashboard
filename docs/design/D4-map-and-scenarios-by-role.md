# D4 — Map and scenario planner: reasoning by role

Companion to D3 sections 6–7. For each role: the decisions they make, what they need to see to make them, how things go wrong, and what that forces in the design. Nothing here is copied from earlier screens.

The shared rules come from one fact: **a missing dot on a map is not evidence that there is no fire**, and **a drawn spread is not evidence of where a fire will go.** Both mistakes can hurt people, so the design answers them directly.

---

## 1. Citizen

**Decisions:** Is there a verified fire near me or on my route? Do I need to leave or avoid an area? Where exactly am I when I report?

**What they need:** a small, calm, trustworthy picture, in their language, on a phone with a poor connection, often under stress.

**What goes wrong:** (a) false reassurance from an empty map; (b) panic from unchecked claims; (c) a precise pin of someone's home or a fire shown publicly; (d) not being able to place a report accurately.

**Design:**
- Default view "Near me": the person's place (GPS on tap, or search a village), verified incidents as **coarse hexagons** with "updated N min ago, shown with a delay", approved advisories (areas under a notice) with the notice text, and static safety places staff have configured.
- A permanent line under the map: *"Nothing shown here does not mean there is no fire. If you see smoke, report it."* with the Report button.
- **Not shown:** satellite signals, unchecked reports, outlook scores, scenarios, other people's reports. The person's own reports appear as private pins visible only to them.
- Report location picker: GPS with an accuracy circle, drag the pin, search a place, "I'm not there now" option; the pin is saved precisely but only staff ever see it.
- Works as a list too ("Nearby: 1 verified area, 4 km north-east") for screen readers and bad networks.
- No terrain, no layer menu: one view, one legend, big targets.

## 2. Range Officer

**Decisions:** Where is my task and how do I get there? What is the ground like on the way? Where is it safe? Where exactly did I observe this?

**Conditions:** outdoors, glare, gloves, one hand, little or no network, low battery, sometimes in danger.

**What goes wrong:** (a) a map that needs a network; (b) clutter that hides the one thing needed; (c) **a predicted spread that looks like a safe zone** and an officer trusts it; (d) battery drained by constant GPS and animation; (e) a lone worker who has stopped responding and nobody knows.

**Design:**
- The map is secondary to the task: opening a task shows the task card with **distance and bearing to the place**, a compass arrow, and the map one tap away. "Open in the phone's navigation app" for roads.
- Offline first: a regional **PMTiles pack** downloaded in advance, with size and "saved on 14 Oct 18:02" shown; terrain hillshade and contours (slope matters), tracks and paths, water points, village names.
- Layers on by default: task, own position (on tap or every 60 s while a task is active, not continuous), terrain, tracks, water. Optional: other assigned officers (only those who chose to share), satellite signals within 10 km of the task labelled "not confirmed".
- **Wind now** (arrow and speed, with time of reading) is shown because it is a fact. **No scenario or spread outline is ever shown to an officer**: a drawn boundary would be read as safe ground.
- Sunlight mode (maximum contrast), large type, no animation, battery-saver switch that disables auto-refresh.
- Capture ties the observation to the exact position and time and shows GPS accuracy; poor accuracy is stated, not hidden.
- Proposal needing a decision from the department (configurable, off until agreed): **lone-worker check-in** — the officer taps "I'm safe" at an agreed interval; a missed check-in alerts the Control Room.

## 3. Control Room

**Decisions:** Which claim is looked at first? Is it credible? Who is nearest and free? What and who is exposed? How is it changing? What do we tell the public? What do we hand over?

**Conditions:** a desk with big screens, long shifts, interruptions, sometimes at night, many claims at once.

**What goes wrong:** (a) duplicates swamp the queue; (b) a real fire is hidden among noise; (c) an unchecked claim is treated as fact; (d) the wrong officer is sent because distances were guessed; (e) context is lost between shifts; (f) a scenario is mistaken for a forecast.

**Design:**
- **Map and queue side by side, always linked:** selecting either selects both; keyboard-driven (next claim, verify, assign).
- **Corroboration aid:** claims close in space and time are grouped as a *suggestion* ("3 reports and 1 satellite signal within 2 km in 40 min"). A person confirms the link or merges as duplicate; the system never merges or verifies by itself.
- **Confidence ladder everywhere:** symbol shape and colour per rung; age shown; stale signals fade.
- **Nearest officers:** straight-line distance and bearing for every officer in scope, with status (free, on task, off duty, not sharing). It says "straight-line, not travel time".
- **Exposure panel for a selected incident:** villages, roads, water points and forest blocks within 1, 3 and 5 km (configurable), from OpenStreetMap data, with population shown only if an official source is loaded.
- **Time replay:** last 6, 24, 72 hours with a slider, so a shift can see how things developed.
- **Weather context** (wind arrow, speed, humidity, observation time) from the weather source, always with its age.
- **Notice area drawing:** draw the area for a public notice on the map; once approved it becomes the citizen advisory layer.
- **Handover view:** the open incidents, assumptions and notes on one printable map sheet with legend and data freshness.
- Source health chip: "Satellite 12 min · Weather 1 h · Field 3 sharing". A source over its limit turns grey and says "stale".

## 4. Scenario planner: who, for which decisions

| Role | Gets it? | Reason |
|---|---|---|
| Citizen | No | They need verified facts and instructions; an unvalidated spread picture causes panic or false safety. |
| Range Officer | No | A spread outline can be read as a safe zone. They get wind now and their supervisor's instructions. |
| Control Room operator / lead | Yes, per incident, switch on | Planning decisions: which villages to warn, where to pre-position, how much time there may be. |

**Decisions it supports (and only these):**
1. Which villages, roads, water points and forest blocks could be reached, and the earliest time range.
2. How sensitive that is to a wind change (compare two scenarios, see the union).
3. Which flank is the head, flank and back under the stated wind, so approach plans can be discussed.
4. What to say in a briefing: inputs and results are saved as a scenario note.

**It must not** decide whether a fire exists, change incident status, trigger alerts or notify anyone, and its words never say "will burn".

**Guardrails built into the design:**
- **Required inputs without defaults.** Head-fire rate of spread, wind speed and direction, duration are typed by the planner; the tool shows typical-range references and sources but fills nothing. No invented numbers.
- **Uncertainty drawn, not hidden:** wind direction ±, wind speed ±, rate ±, as inner and outer bands; a single crisp line is not offered.
- **Reality check:** the latest observed fire edge, satellite signals and field observations are drawn on top. If any lies outside the outer band the panel turns to a warning: *"Observations are outside this scenario. Treat it as unreliable."*
- **Stale rule:** a scenario is marked "outdated" when its weather inputs are older than the configured limit or any input changed since the run.
- **Not validated banner** stays until a validation record exists (see below). It lists what the engine does and does not model (no spotting, no crowning, no fuel-moisture change unless entered).
- **Two engines side by side:** the quick elliptical envelope (instant, explainable formula) and the queued Cell2Fire run (richer, slower). Disagreement between them is shown, not smoothed.
- **Audit:** inputs, outputs, who ran it and who saw it are stored on the incident timeline.

**How it earns trust (validation loop):** when an incident is closed, staff may attach the final observed extent. The system compares it with every scenario run for that incident (overlap and timing error) and builds a **validation page**. Until enough comparisons exist the banner stays; after that the page, not a person's opinion, shows how well it performed and where it fails.

## 5. What each role sees by default (summary)

| | Citizen | Range Officer | Control Room |
|---|---|---|---|
| Start view | Near me | My task | Queue + region map |
| Verified incidents | Coarse hex, delayed | Exact, assigned and in scope | Exact, in scope |
| Unchecked reports | Own only (private) | Own task only | All in scope |
| Satellite signals | No | Within 10 km of task, "not confirmed" | All in scope |
| Outlook / danger index | No | No | Only when the validated-forecast switch is on |
| Weather | Summary text | Wind now | Wind, humidity, age |
| Terrain | No | Hillshade, contours, tracks | Yes |
| Scenario | No | No | Yes, per incident, switch on |
| Offline | Last view cached | Region pack | Not needed |
| Tools | Pin picker | Compass, capture | Draw area, measure, replay, print |

## 6. Consequences for the build

1. One map component with a **role profile** (layers allowed, default layers, controls) so a role cannot enable a layer it should not have; the server also refuses data the role may not read.
2. H3 snapping for the public layer (one configured resolution and delay, no defaults).
3. Corroboration grouping implemented as a pure, tested function (space and time thresholds from configuration).
4. Scenario engine as pure functions with golden tests; reality check as a pure function (observations vs bands).
5. Offline pack builder script (Planetiler to PMTiles) and the pack manager screen for officers.
6. Everything above tested for the negative cases: citizen never receives signals or unchecked reports; officer never receives scenario data; scenario endpoints are Control Room only.
