# What is built, and what is not

This page is the honest list. The landing page and the in-app text only claim what is in the first two sections.

## Built and tested

**Citizen** – Near me (verified coarse areas, official notices, emergency contacts from configuration), Report (map or coordinates, photos, works offline for the text), My reports with a step-by-step timeline and the closing reason, Community (Notices, Discussion, Chat with moderation rules), Account (export my data, close my account), sign-in, registration with a privacy notice, password reset by email when email is configured.

**Range Officer** – Tasks (accept or decline with a reason), task detail with distance and direction, Capture (observation or photo, kept on the phone and sent later with a retry key), Map (task, own position on tap, satellite signals near the task labelled *not confirmed*, wind now, never a scenario), Save map for offline (whole regional basemap, served by the service worker), Me (what is waiting to send, what the public was told, contacts).

**Control Room** – Queue (needs a decision / active / contained / closed, keyboard j k Enter, "possibly the same event" suggestions that never merge), Incident (summary, evidence with human photo review, field observations, timeline, assign or reassign an officer, verify, close with a reason), Log a report (phone, radio, colleague), Map (role profile, time window, source freshness, list for people who cannot use a map), Field (open assignments, unanswered ones flagged), Notices (written by one person, approved by another; moderation queue; chat rooms with slow mode and freeze), Handover notes (acknowledged by a different person), Alert rules, Notifications bell, Scenario tab (see below), People and access for administrators (invite, change states, deactivate, reset link, requests).

**Everyone** – one sign-in, one palette and logo, English / हिन्दी / ଓଡ଼ିଆ, light / dark / system, installable on phones, update prompt, offline pages, size budgets.

**Server** – assignment lifecycle with idempotent observations; closing reasons; region-scoped notifications; escalation of reports with no officer (configured interval); public map policy enforced on the server; satellite (FIRMS) ingestion; password policy; deactivation of staff; full audit trail.

## Built, off until the department decides

| Item | Switch |
|---|---|
| Scenario planner (Control Room only, never validated) | `SCENARIO_PLANNER_ENABLED` |
| Patrol planning | `FEATURE_PATROL_PLANNING`, `VITE_FEATURE_PATROL_PLANNING` (needs a visual refresh before it is switched on) |
| Public verified areas | `PUBLIC_MAP_*` |
| Emergency numbers | `EMERGENCY_CONTACTS` |

## Not built

- **AI-assisted report drafts.** Needs a model provider and a data-handling decision first (D-33).
- **Scenario validation page** (compare saved scenarios with the final observed extent). Until it exists the "not validated" banner never goes away.
- **Cell2Fire runs from the new screens.** The engine is the quick elliptical envelope only. The older spread endpoint stays disabled on the server.
- **Officer position sharing and the "officers" layer** on the Control Room map; **lone-worker check-in**; **time replay**; **measure and draw tools**; **terrain and contours** on the basemap; **exposure from basemap places** (places are typed in by the planner).
- **ERA5 weather** is configured but not wired to a screen; the wind shown comes from the weather source the server already uses.
- **Retention** for satellite hotspots; **feed scheduling** (the commands exist, the schedule is the operator's).
- **Hindi and Odia** are first drafts for everything and need review by native speakers. A few staff-only messages (form validation text, the automated-assessment banner, scenario errors) are English only.
- **Legacy sign-in** (`/api/auth/login`) and some legacy API routes remain for compatibility; nothing in the new screens uses them.

## Known limits

- Hotspot rows with no state are visible to any staff scope.
- The notices and public rate limiters are per server process.
- The older `officer` and `viewer` roles cannot sign in on the new page; move those people to Control Room operator.
- Access tokens last 15 minutes: a deactivated person keeps access until their token expires, but cannot renew it.
