# Copy audit — redesign-v2

Every user-visible string currently rendered by the redesign-v2 app (as of commit `daafa53`,
after the Replay/evidence screen and Incident's proximity-baseline UI were removed), tested
against three questions:

- **(a) Does it tell the user what to do or see?** — orientation, an instruction, a value, a
  state. Decorative or purely structural text fails this.
- **(b) Is it true of what the screen shows right now?** — stale copy describing a removed
  feature, an old number, or a claim the current screen doesn't back up fails this.
- **(c) Would the user miss it if it were removed?** — if deleting the string changes nothing
  about what the user understands or can do, it fails this.

A string that fails (b) is flagged **Change** or **Delete** regardless of (a)/(c), since false
copy is worse than no copy. A string that passes (a) and (b) but fails (c) is a candidate for
**Delete** (decorative/redundant) unless it's doing quiet, real work (e.g. an `aria-label` only a
screen-reader user would miss). This document only lists findings — **no copy has been changed
as a result of this audit**; it's for review before any of it is applied.

Scope: the operational screens (Landing, Today, Watch, Incident, Field) and the shared
chrome (nav, role switcher, trust/sample badges). The Styleguide route (`/redesign/styleguide`)
is a component-inventory page for developers, not part of the range-officer/control-room/field-
crew workflow; its strings are dev-facing labels ("DEFAULT", "LOADING (BUSY)", etc.) that don't
need the same scrutiny — it's covered at the end in one summary section rather than string-by-
string, with a flag on the one open question it raises (should it ship to production at all).

## Navigation & shared chrome

| String | Where | Verdict | Reason |
|---|---|---|---|
| "Home" / "Today" / "Watch" / "Incident" / "Field" / "Styleguide" | Nav bar (`RedesignRoot.tsx`) | **Keep** | (a) orientation/navigation, (b) true — each links to a real screen, (c) yes, it's the only nav. "Styleguide" in a nav a real user sees is arguably wrong (see Styleguide section below) but that's a routing question, not a copy one. |
| "Viewing as" | `RoleSwitcher` label | **Keep** | (a) labels the selector, (b) true, (c) yes — without it the dropdown is unlabeled for sighted users (it does have a fuller `aria-label` for screen readers already). |
| Role names ("Range officer", "Control-room operator", "Field crew / beat guard", "Incident commander", "Reviewer / judge") | `RoleSwitcher` dropdown options | **Keep** | (a)(b)(c) all pass — real options, true, needed to pick one. "Reviewer / judge" is worth double-checking against who actually uses this tool now that the Replay/evidence screen (presumably judge-facing) is gone — flagged as a **question**, not a verdict, since removing a role is a product decision, not a copy fix. |
| "Demo data" badge text | `SampleDataBadge`, every screen | **Keep** | (a) tells the user the data isn't live, (b) true, (c) yes — this is the single most load-bearing honesty string in the app; removing it would materially mislead. Already renamed from "Sample data" per the user's prior amendment. |
| Badge tooltip/title text (varies: "Demo data from the 4 replay incidents...", "Archived Bar v3 replay for a 2023–2024 demo date...", "Archived replay, not real-time.") | `SampleDataBadge` `note` prop, per screen | **Keep, consider consolidating** | (a)(b) pass. (c) is borderline — it's a `title` attribute, only visible on hover/long-press, so most users never see it. Not wrong, just low-reach; flagged as a **nice-to-have consolidation** (one consistent sentence instead of three slightly different ones), not a correctness issue. |
| "Advisory forecast. Confirm with field observations." | Footer, Today + Incident | **Keep** | (a) tells the user what to do with the information (verify in the field, don't act on it alone), (b) true of every screen it's on, (c) yes — this is a safety-relevant instruction, not decoration. |

## Landing page (`LandingPage.tsx`)

| String | Verdict | Reason |
|---|---|---|
| "Three tools, not one." (h1) | **Keep** | (a) orients a first-time visitor to the app's shape, (b) true — the app is exactly these three tools now that Replay is gone, (c) yes, it's the page's whole point. |
| "A daily rank of forest cells for tomorrow. A queue for satellite and field detections. A scenario — only after a human confirms a fire — shown next to a simple guess it did not beat." (hero paragraph) | **Change** | (a) passes — it's the page's core explainer. **(b) fails**: "shown next to a simple guess it did not beat" describes the proximity-baseline comparison that was just removed from the Incident screen. This sentence is now describing a feature that doesn't exist in the rendered app anymore — the same problem the Scenario card below had (already fixed in the previous commit). Needs a rewrite of the last clause; not rewritten here since this audit is report-only per the user's instruction. |
| "See today's ranking" (button) | **Keep** | (a)(b)(c) all pass — real CTA to a real screen, the only one on the page now. |
| "Interactive ranked-cell map (pan/zoom) — rendered on the Today screen" | **Keep, reconsider placement** | (a) sets expectations for the placeholder graphic, (b) true, (c) yes — without it the empty-looking box below the hero is confusing. Worth asking whether this placeholder box should exist at all now that Today has a real map one click away (see **question** below), but the string itself is accurate. |
| "Demo data" badge (on the landing placeholder) | **Keep** | Same as the shared-chrome entry above. |
| "01 / Forecast / Tomorrow's patrol priority, ranked. Never a prediction, never 24/48h." | **Keep** | (a)(b)(c) pass — accurately describes Today. |
| "02 / Detection / Satellite and field reports, triaged by a person before anything counts as confirmed." | **Keep** | (a)(b)(c) pass — accurately describes Watch. |
| "03 / Scenario / Only after verification: an estimate of how a confirmed fire might spread, from forecast wind and fuel." | **Keep** | Already rewritten in the previous commit specifically so this passes (b) after the baseline UI was removed. |

**Question for the user, not a copy verdict:** the landing page's map placeholder (a bordered box
saying "Interactive ranked-cell map... rendered on the Today screen") was always meant to be
replaced by something — originally the plan was a real map here too. Now that Today has a real
MapLibre+PMTiles map, is this placeholder box still wanted on the landing page, or should it
either embed the real map or be cut? Not a copy-audit call; flagging it because it's the single
most visible "placeholder-shaped" thing left in the app.

## Today (`TodayPage.tsx`)

| String | Verdict | Reason |
|---|---|---|
| "Tomorrow's patrol priority" (h1) | **Keep** | (a)(b)(c) pass. |
| "Model: Bar v3 · Date: 2024-03-10 (archived replay of a past date) · Coverage: Odisha, Chhattisgarh, Telangana, Madhya Pradesh, Maharashtra, Jharkhand only" | **Keep** | (a) tells the user exactly what they're looking at and its scope, (b) true, (c) yes — a range officer in a state outside this list needs to know this ranking doesn't apply to them. This is load-bearing honesty copy, same category as the Demo-data badge. |
| "This ranks forest cells for tomorrow only — it is not a prediction and never shows a 24/48h horizon. Outside the six states Bar v3 is scoped to (OD, CG, TS, MP, MH, JH), this screen shows "Not validated here" rather than a risk value, because the model has not been checked for other states' seasons, sensors or vegetation." | **Keep** | (a)(b)(c) pass — this is the trust-rules explainer (09_trust_rules.md) in user-facing form; it's long but every clause is doing real work (no-prediction claim, no-24/48h claim, six-state scope, the specific "Not validated here" wording the user will actually see). A **candidate for shortening** (it's dense), but not for deletion — flagged as a **style** note, not a correctness one. |
| Risk legend labels ("Very high (top 1%)", "High (top 5%)", "Moderate (top 15%)", "Low") | **Keep** | (a)(b)(c) pass — needed to read the map/list. |
| "Loading today's ranking…" | **Keep** | (a)(c) pass, (b) true only while loading — correctly conditional. |
| "Risk data could not load" / "The archived replay for this date is unavailable. Try a 2023–2024 demo date." | **Keep** | Correct error-state copy; tells the user what happened and what to try. |
| "Not validated here" / "No archived ranking exists for this date/region. Outside the six scoped states, RESQ does not show a risk value." | **Keep** | Core trust-rule empty state; see 09_trust_rules.md — this exact string is tested for in `redesign.spec.ts`. |
| LayerPanel labels ("Risk cells", "Detections", "Incidents", "Boundaries", "Roads", "Settlements", "Unavailable") | **Keep** | (a)(b)(c) pass for the available ones. The "Unavailable" ones are arguably **borderline on (c)** — would a range officer miss a disabled checkbox labeled "Unavailable"? Probably not deeply, but it's honestly disclosing a real gap (07_maps.md) rather than hiding it, which matches this project's standing honesty bar. Recommend **keep**. |
| "Cell {N} · {State}" / band value ("Low"/"Moderate"/etc.) | **Keep** | (a)(b)(c) pass — this is the actual content of the ranked list. |
| "Advisory forecast. Confirm with field observations." | **Keep** | See shared-chrome entry. |

## Watch (`WatchPage.tsx`)

| String | Verdict | Reason |
|---|---|---|
| "Detection queue" (h1) | **Keep** | (a)(b)(c) pass. |
| "Satellite and field reports needing a human check. Nothing here is a confirmed fire until someone verifies it." | **Keep** | (a)(b)(c) pass — this is the core trust-rule sentence for this screen (nothing is "confirmed" without a human). Load-bearing. |
| "Loading the triage queue…" / "The triage queue could not load." | **Keep** | Correctly conditional loading/error copy. |
| Detection card content (incident label, source, state, "detected {datetime}") | **Keep** | (a)(b)(c) pass — this is the actual triage information an officer needs to act. |
| Status badges ("Verified" / "Dismissed" / "Escalated" / "Not yet verified") | **Keep** | (a)(b)(c) pass — directly actionable state. |
| "Verify" / "Dismiss" / "Escalate" (buttons) | **Keep** | (a)(b)(c) pass — the three real actions on this screen. |

## Incident (`IncidentPage.tsx`)

| String | Verdict | Reason |
|---|---|---|
| "Spread scenario — {incident_id}" (h1) | **Keep** | (a)(b)(c) pass. |
| "Uncalibrated scenario — one simulation run, not a forecast." (TrustBadge) | **Keep** | (a)(b)(c) pass — this is the single most important honesty string on this screen: it's the thing standing between a user treating this as a forecast and understanding it's one run. Non-dismissible, tested in `redesign.spec.ts`. |
| "Estimate from forecast wind and fuel. Real fires can differ." (new caveat, replacing the baseline overlay text) | **Keep** | (a) tells the user how to weigh the estimate, (b) true, (c) yes — it's the only caveat left on this screen now that the baseline comparison is gone, and it's short and direct in a way the old "Baseline shown: Proximity (fire stays near the ignition point)." sentence wasn't (that one required understanding what a proximity baseline even is). |
| "Running the scenario view…" / "This scenario could not load." | **Keep** | Correctly conditional. |
| Probability band legend ("0–20%", "20–50%", "50–80%", "80–100% of ensemble members burning") | **Keep** | (a)(b)(c) pass — needed to read the map fill colours. |
| LayerPanel ("Burn probability bands", "Boundaries"/"Roads"/"Settlements" + "Unavailable") | **Keep** | Same reasoning as Today's LayerPanel. |
| "Overpass (k = time since the first detection, not a fixed hour)" / "Overpass {k} of {maxK}" | **Keep, consider rewording** | (a)(b) pass, but this is the densest, most jargon-heavy string in the app ("k = time since..."). A range officer has to parse a variable-name explanation to use a slider. **Flagged for plain-language rewording** (e.g. "Time since detection: pass {k} of {maxK}"), not deletion — the underlying concept (satellite overpasses aren't evenly spaced) is real and matters. |
| "Wind source" label + options ("ERA5-Land (primary)", "ERA5 0.25° (sensitivity)", "best_match (not a reanalysis, sensitivity)") | **Keep, consider reword** | (a)(b) pass. "best_match (not a reanalysis, sensitivity)" is internal modeling vocabulary ("reanalysis", "sensitivity") leaking into user-facing copy. Flagged for **plain-language rewording** of the option labels (e.g. "ERA5-Land (recommended)" / "ERA5 (coarser grid)" / "best_match (alternate weather source)"), not removal — the user does need to be able to tell the three apart. |
| "Wind source changes this result more than anything else tested. Compare it yourself." | **Keep** | (a) tells the user what the control does and why it matters, (b) true, (c) yes — without it, the wind-source switch looks like a minor setting instead of the single biggest driver of the output. |
| "Show hourly wind arrows" | **Keep** | (a)(b)(c) pass — labels a real toggle. |
| "Assumptions in this run" (expandable) + its contents (fuel/weather/terrain text) | **Keep** | (a)(b)(c) pass, though the fuel-assumption sentence is long and technical ("TL2 for tree cover, GR1 for grassland..."). Flagged as a **style** candidate for simplification, not a correctness issue — it's accurate, just dense. |
| "Export briefing (includes Uncalibrated-scenario label)" (button) | **Keep** | (a)(b)(c) pass — tells the user what the export contains, which matters precisely because it guarantees the honesty label survives into a printed/exported document. |
| "Advisory forecast. Confirm with field observations." | **Keep** | See shared-chrome entry. |

## Field (`FieldPage.tsx`)

| String | Verdict | Reason |
|---|---|---|
| "Field verification" (h1) | **Keep** | (a)(b)(c) pass. |
| "Verify assigned detections from the ground. Reports queue and sync automatically when you have signal." | **Keep** | (a)(b)(c) pass — tells a field user exactly what this screen is for and what happens when they're offline, which matters a lot for this specific user. |
| "Offline. {message} Changes will sync when you reconnect." (`OfflineBanner`) | **Keep** | (a)(b)(c) pass, conditionally — this is exactly the kind of message a field user in bad signal needs. |
| Task label (e.g. "Telangana — Feb 2024") | **Keep** | (a)(b)(c) pass — identifies which detection the user is verifying. |
| "Note" (textarea label) | **Keep** | (a)(c) pass; necessary label for the field. |
| "Capture photo" / "Retake photo" (button) | **Keep** | (a)(b)(c) pass. |
| "Photo captured: {name}. Will upload when syncing." | **Keep** | (a)(b)(c) pass — confirms the action worked and sets expectations about timing. |
| "No photo was captured. Check camera access and try again." | **Keep** | Correct error copy with a concrete next step. |
| "Submit verification" (button) | **Keep** | (a)(b)(c) pass. |
| "Sync queue" (h2) | **Keep** | (a)(b)(c) pass — labels the section below. |
| "Nothing queued." | **Keep** | (a)(b)(c) pass — a real, correct empty state (confirms there's nothing pending, which is itself useful information for a field user checking sync status). |
| Queue item state labels ("Pending", "Syncing…", "Synced", "Failed") + "(attempt {n})" | **Keep** | (a)(b)(c) pass — this is the whole point of a visible sync queue; a field user needs to know what happened to their report. |
| "Retry" (button, shown only on Failed) | **Keep** | (a)(b)(c) pass. |

## Styleguide (`/redesign/styleguide`) — summary, not string-by-string

Every string on this page is a component-inventory label aimed at a developer reading
`08_design_system.md` alongside it ("DEFAULT", "EMPTY", "LOADING (BUSY)", "BOUNDS-FIT (INCIDENT-
SCOPED)", etc.), plus the real component instances shown in each state (which reuse strings
already audited above, e.g. "Verify"/"Dismiss"/"Escalate", "Uncalibrated scenario"). None of it
fails test (b) — it's accurate to what it's demonstrating. The open question is scope, not
wording: **should `/redesign/styleguide` be reachable from the same nav a range officer sees**,
or should it be moved behind a dev-only route/flag? That's a routing decision, flagged here for
visibility, not something this copy audit resolves.

## Summary

- **No "Delete" verdicts** — the research-content removal (Replay screen, baseline UI, AUC/AP/IoU,
  "refuses to claim" section) already happened in the previous commit; everything that remains in
  this inventory earns its place by this audit's own tests.
- **One real "Change"**: the landing page's hero paragraph still describes the baseline comparison
  that was removed — needs its last clause rewritten to stay accurate (test b failure).
- **Three style/plain-language flags**, none urgent, none honesty-critical: the Overpass-slider
  label's "k =" jargon, the wind-source option labels' "reanalysis"/"sensitivity" jargon, and the
  assumptions-panel fuel sentence's density.
- **One consolidation idea**: the three slightly different "Demo data" tooltip sentences could be
  one consistent sentence.
- **Two product/scope questions, not copy questions**: whether the landing page's map placeholder
  should still exist now that Today has a real map, and whether the Styleguide route belongs in
  the production nav.

Nothing in this document has been applied. Awaiting the user's review before any copy changes,
test updates, or further work (the follow-up items — 390px screenshots after the map idle event,
mobile load-time reporting, lazy-loading the map, shrinking the PMTiles bundle, and a full re-run
of axe/Lighthouse/tests — are also on hold per the coordinator's instruction).
