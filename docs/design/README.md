# TerraWatch design track

Status: **built.** D0 to D5 were the design; the product now follows them. `STATUS.md` lists what is built, what is off until the department decides, and what is not built. `decisions.md` records every decision taken along the way (D-01 to D-38).

This folder is the source of truth for how TerraWatch should work and look, written before the screens are built. It follows `TerraWatch_Plan_v3.1` (stages D0 to D7).

## Documents
| File | Stage | What it answers |
|---|---|---|
| `D0-role-briefs.md` | D0 | Who the three roles are, what they need to do, what they must never be able to do |
| `D0-success-measures.md` | D0 | How we will know the product works (definitions only; targets are set with you) |
| `D1-journeys.md` | D1 | Task flows and lifecycle diagrams for every core journey, including offline and failure |
| `D1-information-architecture.md` | D1 | Sitemap, clean URLs, screen inventory, the single login, notifications, permissions, offline rules |
| `D1-findings.md` | D1 | Defects and gaps found in the current product while drawing the flows, with evidence |
| `D2` to `D5` | D2-D5 | Role screens, the clean-sheet design, map and scenarios by role, community by role |
| `decisions.md` | all | The decision log |
| `STATUS.md` | now | Built / off / not built, and known limits |
| `../operations/CONFIGURATION.md` | now | Every setting, and what each turns on |

## Evidence tags (used throughout)
- **[code]** verified in the repository at `origin/main` `2422658`
- **[you]** a decision or fact you gave us
- **[assumption]** our hypothesis, to be confirmed with real people before it is relied on

## Ground rules carried over
Exactly three roles: Citizen, Control Room, Range Officer. One application, one login, one colour system. Production content only: observed detections, verified incidents, official advisories, a standard fire-danger level, real historical events. Anything not yet validated stays out of production screens. No invented numbers: where a target or a phone number is needed, the document says who must supply it.

## How to review
Read `D0-role-briefs.md` first and correct anything that does not match your people. Then `D1-journeys.md`. Mark disagreements directly in the files or send them back; D2 (wireframes) does not start until D0 and D1 are agreed.

## Open items needing a person (not a guess)
1. Real people to interview and test with, per role. Until then, simulated accounts only.
2. Emergency numbers and escalation contacts per region (never invented).
3. Who in the forest department approves: public map policy, fire-danger wording, official announcement authority.
4. Success targets (see `D0-success-measures.md`).
5. Pilot region, retention rules and hosting region (all kept as configuration).
