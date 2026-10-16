# D1: Findings register

Defects and gaps found in the current product while drawing the flows. Evidence is from the repository at `origin/main` `2422658` unless stated. Severity is a proposal. "Fix in" names the design or work package that resolves it.

| ID | Severity | Finding | Evidence | Proposed fix | Fix in |
|---|---|---|---|---|---|
| UX-01 | High | Any verification, even "inconclusive", completes the assignment at once; it can also be submitted without accepting | `workflow.py` `submit_verification` sets `status='completed'`; allowed from `assigned` | Accept first; several observations; explicit completion (see journeys section 4) | WP 2 |
| UX-02 | Medium | Closing an incident has no structured reason, only optional free text | `IncidentStatusUpdate{status, notes}` | Required reason list plus note; citizen sees the reason | WP 2 |
| UX-03 | High | The Control Room incident screen cannot view the photo or record a human review; only the older staff area can | Evidence section prints the filename and "Human review: <status>" as text; the review endpoint is referenced only from the old staff screen | Build the evidence viewer and review as the first Control Room component | WP 2 |
| UX-04 | Medium | Notifications for new reports and verifications go to every Control Room user regardless of region | three recipient queries without a region filter (`citizen.py`, `workflow.py`) | Scope by region | WP B/3 |
| UX-05 | Medium | Inconsistent role names: verification accepts `field_crew`, image review accepts `range_officer`; eight role strings exist | route role checks | Three roles plus capabilities | WP B |
| UX-06 | Medium | Community: no edit or delete of your own post; chat polls every 5 seconds | no such endpoints; `setInterval(...,5000)` | Edit window, delete, server-sent events | WP 6 |
| UX-07 | Medium | Colour: control borders 1.41:1 (light) and 1.65:1 (dark) against 3:1; 104 hardcoded colours bypass the tokens | measured contrast; code scan | `border-control` token, hex lint, outlines on risk fills | D3 / D6 |
| UX-08 | Medium | Map fetches fonts and icons from a third-party host; boundary and road layers unavailable; no offline area | `map.tsx` glyph and sprite URLs; layer flags | Self-host assets; build layers; offline areas | WP 7 |
| UX-09 | Medium | The service worker has no offline page; offline behaviour is only partly covered | `sw.js` | Offline shell and cached areas | WP 5 |
| UX-10 | Low | The safety line has no emergency number or call button | `CitizenApp.tsx` text only | Regional number from configuration | D4 / WP 5 |
| UX-11 | Medium | Three login routes, two login components, four login endpoints | route table, `App.tsx`, `auth.py` | One login | WP 1 |
| UX-12 | Low | Screens are written as very long single lines (one is 5,928 characters), so they cannot be reviewed or tested | `ControlRoomApp.tsx` line 86 | Rebuild from the component kit | D6 / WP 2 |
| UX-13 | Medium | Navigation and URLs use internal names such as "redesign" and "saved spread example" | `RedesignRoot.tsx` NAV | Clean URLs and plain labels | WP 1 |
| UX-14 | Medium | Headings use a serif face; Hindi and Odia fonts are not declared | CSS | One sans family covering Latin, Devanagari and Odia | D3 |
| UX-15 | Info | 15 of 75 API routes have no UI reference (simulation, replay, invites, admin reset, audit-log viewer, token refresh, `/me`) | route versus frontend scan | Wire, defer behind a switch, or remove after you confirm | D1 review |

Notes
- Nothing above was changed. UX-03 is the one I would fix first because it is the human-review safety step.
- UX-01, UX-02 and UX-04 need small data-model changes and migrations (Alembic) before screens can rely on them.
