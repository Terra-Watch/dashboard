# 02. Users and use cases

Read `01_narrative.md` first.

## 1. Range officer / forest division — morning patrol planning

- **Job:** decide, by 7am, which forest cells to send today's limited patrol teams to.
- **Context:** office or a jeep, sometimes a tablet, usually a phone; patchy signal on the way out; decides within 15-30 minutes before teams leave.
- **Top 3 tasks:** (1) see today's ranked cells for their division; (2) understand *why* a cell ranks high in one glance; (3) hand a short list to teams (names/places, not scores).
- **Must never misread:** that "Very high" means a fire will start there, or that the rank is a multi-day forecast — it is tomorrow only, relative to other cells today.
- **Success measure:** patrol list produced and shared before teams leave; officer can explain to a team member in one sentence why a cell was picked.

## 2. Control-room operator — detection triage

- **Job:** watch the incoming queue of satellite detections and field reports, and for each one decide: verify, dismiss (false alarm), or escalate to an incident.
- **Context:** desk, large screen, often overnight shifts; many detections per day across a division; time pressure is "don't let a real fire sit unverified."
- **Top 3 tasks:** (1) triage the queue fast — age, confidence, proximity to priority cells; (2) pull up context (recent detections nearby, is it inside a "Very high" cell) to decide quickly; (3) escalate with the right evidence attached (who confirmed, how).
- **Must never misread:** an unverified detection as a confirmed fire — the UI must make "not yet verified" impossible to miss, and must never let a detection silently become an "incident" without an explicit verify action.
- **Success measure:** queue age stays low (nothing sits unverified for hours without a reason); no incident created without a documented verification step.

## 3. Field crew / beat guard — verification on a phone with weak signal

- **Job:** go to a reported or detected location and confirm (or dismiss) it as a real fire.
- **Context:** on foot or motorbike, phone, often one or two signal bars or none; time pressure is getting back to safety and to signal, not filling forms.
- **Top 3 tasks:** (1) see the location and get there (works offline once loaded); (2) submit verification — photo, short note, GPS — with one or two taps; (3) know it queued even with zero signal, and see it sync later.
- **Must never misread:** that a failed sync means the report is lost — the UI must show "Waiting to sync," never silently drop it, and never require signal to submit.
- **Success measure:** a verification can be captured and queued in under 30 seconds with no signal, and the guard can confirm later (even much later) that it reached the control room.

## 4. Incident commander — reading 6/12/24/48h scenarios

- **Job:** once an incident is verified, decide where to position crews over the next two days using the spread scenario as one input among several (terrain knowledge, crew availability, access).
- **Context:** field command post or vehicle, tablet or laptop, moderate time pressure — minutes, not seconds, but repeatedly as conditions change.
- **Top 3 tasks:** (1) see the probability-band scenario at each horizon (6/12/24/48h) with the wind source and assumptions visible; (2) compare the scenario against the simple baseline outline to judge how much extra it's really telling them; (3) export a short briefing to share with crews, with all caveats intact.
- **Must never misread:** the scenario boundary as a guaranteed fireline, or the 48h frame as more certain than the 6h frame — probability bands and the "uncalibrated scenario" badge must be visible at every horizon, and the baseline outline must never be hideable without the caveat following it.
- **Success measure:** commander can state, for any exported briefing, which parts are simulated and which are the baseline, without looking anything up.

## 5. Reviewer / judge — viewing replay and evidence

- **Job:** assess whether RESQ's claims match its evidence — for a hackathon/demo judge, a technical reviewer, or an internal sign-off before any real deployment.
- **Context:** desktop, no time pressure in the sense of an emergency, but limited patience — wants the honest number fast, not a sales pitch.
- **Top 3 tasks:** (1) see, per replayed incident, simulation vs baseline vs the real VIIRS footprint, with the actual AUC/AP/IoU numbers; (2) see that the four incidents are development incidents, not a held-out test; (3) see the wind-source sensitivity and the one line that states plainly whether the simulator won or lost.
- **Must never misread:** a single favorable number (e.g., the one incident where simulation won on IoU) as a blanket win — the headline must always state "did not beat the baseline in a consistent way" per `docs/RESQ5_RESULTS.md` §1, with the win/loss table shown in full, not cherry-picked.
- **Success measure:** a reviewer can find the exact losing and winning numbers, per incident, in under one minute, with no number traceable to anything other than `results/resq5/` or `docs/RESQ5_RESULTS.md`.
