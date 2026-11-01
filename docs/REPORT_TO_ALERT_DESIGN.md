# From a citizen's photo to a confirmed alert: design

Status: PROPOSED, 2026-11-01. Design only, nothing built. Open decisions are in section 14. English only for the first release.

Audience: the owner, the engineers, and the Control Room and field staff who will review the screens.

## 1. What we want to happen

A citizen sees smoke or fire, opens TerraWatch, takes a photo and sends it. Within minutes:

1. The Control Room sees it on the map with the photo and a plain statement of how much to trust it.
2. Our AI evidence check says whether the photo looks like visible fire or smoke and whether it looks edited or reused. This only helps the reviewer.
3. A person confirms it, or sends a ranger to look, or dismisses it with a reason.
4. Only after that, people nearby are told: "Fire reported near you, confirmed by the forest department," with an approved photo, an approximate place and what to do.
5. The citizen who reported it sees every step, and is told when it is closed.

The hard part is not the technology. A wrong alert sends crowds towards a fire, or panics a village, or teaches people to ignore us. So the design rests on one rule: **nobody is told "fire confirmed" until a person has confirmed it.** Before that, other citizens can see the report and its photo, but always labelled **Unverified: reported by a citizen, not checked by officials**, never with a push notification, and never with an exact place (section 8).

## 2. What exists today, honestly

| Area | Today |
|---|---|
| Citizen report | Form with photo (camera), place by GPS or map pin, what you see, time. The server now takes the state from the position. Photos over about 4.5 MB fail on Vercel. |
| Ranger report | A form that sends the report first; the photo button appears only after it is sent, and it works per report. |
| Control Room | A queue of incidents, a map, a detail page with evidence, a verify or close decision, officer assignment. |
| AI evidence | Runs on uploaded photos. In shadow mode now, so staff do not see its result yet. Advisory only, always "requires review". |
| Citizen map and alerts | Official notices for a region, and a public map of **verified** incident areas on a coarse grid with a delay. No push. A citizen cannot be told "something was confirmed near you". |
| Community | Posts and rooms with moderation; not connected to incidents. |

Gaps this design closes: reliable photo upload, the report's pin on the map for the reporter, a proper receiving screen for the Control Room, a ranger report that carries its photo, corroboration across reports and satellite detections, and notifying nearby citizens in a safe way.

## 3. Principles

1. **A person decides what is called confirmed.** AI and satellite data raise or lower priority and can hold a photo back. Only staff can mark a report confirmed.
2. **Say how sure we are, in words.** "Reported by one citizen, not yet checked." Never a score, never "AI says real" (also a standing product rule: no raw model scores in the UI).
3. **Fast to send, even with a poor signal.** Photo shrinks on the phone, the report saves offline and sends later.
4. **Protect people.** No reporter identity in anything public. Exact positions stay with staff. Photos are cleaned of hidden location data before anyone else sees them.
5. **Open about what is unverified, loud only when confirmed.** Citizens see reports early, clearly labelled. Only confirmed fires send a push.
6. **Close the loop.** Every alert ends with an update: confirmed, being handled, contained, or false alarm.
7. **Emergency first.** Every report screen says: if someone is in danger, call the emergency number (112 in India). TerraWatch does not replace it.

## 4. The life of a report

States, and who can see what. "Staff" means Control Room and the rangers in scope.

| State | Meaning | Reporter sees | Staff see | Other citizens see |
|---|---|---|---|---|
| Received (unverified) | Saved on the server and passed the automatic checks | "Received" | Queue card, pin, photo, AI evidence | The report and cleaned photo, labelled "Unverified", coarse area only, no push |
| Held | An automatic check found a reason for care (section 8) | "Received" | Same, with the reason | Nothing until staff release it |
| Corroborated (a flag, not a state) | Other reports or a satellite detection agree | nothing new | Higher priority, linked evidence | The unverified report gets a note: "2 other reports and a satellite detection nearby" |
| Checking | A person opened it, or a ranger is sent | "Being checked" | Owner, timer | Label changes to "Officials are checking" |
| Confirmed | Staff verified fire or smoke | "Confirmed. Thank you." | Full record | A fire alert, approved wording and photo, approximate area |
| Responding | A crew is on it | "Crews are responding" | Assignments | Alert updated |
| Contained / Closed | Done, or not a fire | "Closed" with a safe reason | Full record | Alert ends with a closing note |
| Not confirmed | Could not be verified, or not a fire | "We could not confirm this. Thank you." | Reason and notes | The report and photo disappear from the public view at once |

A report can go to "Not confirmed" for kind reasons (smoke was a cooking fire, a controlled burn, mist). The reporter is never told they were wrong or lying.

## 5. The citizen's report screen

Goal: one thumb, under a minute, works on weak mobile data.

1. **Open camera first.** The first thing on the screen is the camera button and "Take a photo of the smoke or fire. Stay safe, do not go closer." A photo is not required; "Report without a photo" is one tap lower.
2. **Place found for you.** GPS runs while they take the photo. A small map shows a pin on their position with a circle for the accuracy. They can drag the pin ("The fire is not where I am"). The pin is the fire's place, not necessarily theirs; the form says which it is. If the position is outside the covered states, the screen says so plainly and shows the emergency number.
3. **One tap: what you see.** Smoke, flames, both, burnt ground, not sure. Then optional size ("small", "spreading", "large") and a free note.
4. **Send.** The photo is resized on the phone first (long side about 1,600 pixels, JPEG; target under 1 MB; the original is not sent) so uploads work on bad connections and stay under the platform's request limit. Photo and report are sent together as one action: the report is created, then each photo is attached, and the screen only says "sent" when the report exists. A photo that fails is retried, and the report shows "photo waiting to send".
5. **Offline.** If there is no signal, everything is kept on the phone and sent on reconnection, with a visible "Saved on this phone, will send when you have signal" state. (The ranger side already does this for text.)
6. **Confirmation screen.** Reference number, the pin on a map, the photo thumbnail, the status line, and what happens next. A "Keep a distance, call 112 if in danger" box stays visible.
7. **Duplicates.** If a report within about 1 km and the last few hours already exists, say "Someone nearby has already reported this. Add your photo and view to help confirm it." Their report is linked, not discarded. This is the point where several citizens helping each other turns into proof.

My reports screen: each report with a thumbnail, a map pin, the status line and a timeline. No AI result, no reviewer notes, no staff names.

## 6. The ranger's report screen

Rangers report under their own scope, usually from the forest, often with poor signal.

- Same flow as the citizen, plus: size, spread direction, wind, access, and "needs help now".
- The photo is part of the form, not a second step after sending. The ranger sees the report as queued even before signal returns.
- Position comes from the phone with its accuracy, and the ranger can drag the pin.
- Their report carries a "field officer" mark in the queue. It is still reviewed by the Control Room, but it ranks higher because it is first-hand and the person is trained.
- A ranger can attach photos to an existing incident or task, as now.

## 7. The Control Room: receiving and deciding

The queue is the main work screen. It must make the next decision obvious.

**Queue card** (one per incident, not per photo):
- A small map thumbnail, the first photo, the time since reported, the state and a place name.
- A trust line in words: "3 citizen reports and 1 satellite detection within 2 km", or "1 report, nothing else yet".
- Priority chips: Needs attention now, New, Waiting for field check, Unattended for N min. The queue sorts by priority, then age.
- Evidence summary for each photo: "Looks like visible smoke" or "Could not tell", plus "Possible edit" or "Seen before" when the check finds a reason for care. Words only.

**Priority** comes from a plain, written rule, not a hidden score:
1. First-hand report from a ranger raises it.
2. Several independent reporters within a short distance and time raise it.
3. A satellite fire detection near the position within the last few hours raises it. Satellite detections of the kind we already ingest (VIIRS active-fire) arrive several times a day, so a match is strong support and no match is not proof of nothing.
4. The fire danger ranking for the day in that cell raises it a little. It is a ranking of where to look, not a prediction of fire.
5. A photo flagged as possible edit or reuse lowers confidence in that photo, never in the whole incident, and is shown to the reviewer.

**Incident page:**
- Left: the map with the exact pin, the satellite detections, the other reports and the nearest ranger stations or crews; right: the evidence viewer.
- Evidence viewer: photos large, with the AI evidence panel beside each one ("What it looks like", "Could it be edited or reused", "Not seen before"), and the standing line "Advisory. A person decides." Location data in the photo, when present, is compared with the pin and shown as "Photo location matches" or "differs by N km".
- Timeline of everything: who reported, when, who looked, what they decided and why.
- **Actions:** Confirm fire or smoke; Send a ranger to check (creates a task); Needs more information (sends the reporter a short question); Not confirmed (reason required: controlled burn, cooking or waste fire, cloud or mist, not forest, duplicate, other); Merge with another incident.
- **Confirm** opens an "Alert nearby people?" step (section 8) with a preview of exactly what they will see. Confirming an incident and alerting the public are two separate clicks so staff can verify quietly first.

**Safeguards for staff:** every decision is logged; a decision can be reversed with a reason; an incident left unattended for the set time escalates to the next duty officer (a rule that exists as an alert today).

## 8. Telling nearby citizens

Two levels, kept clearly apart: unverified (public, labelled, no push) and confirmed (alert, with push).

### Tier A: unverified citizen reports (public, labelled)
Decision taken by the owner: citizen photos are public before confirmation, marked unverified.

- **What people see:** a card and a map marker styled differently from confirmed fires (grey outline, dashed ring, no red) with the words **"Unverified: reported by a citizen N min ago. Not checked by officials."** The cleaned public copy of the photo, the note the citizen wrote, the coarse area and place name, the distance from the viewer. As evidence builds the label adds facts, not claims: "2 more reports and a satellite detection nearby", then "Officials are checking", then it becomes a confirmed alert or disappears.
- **No push, no sound.** Unverified reports appear in the app map, the Near me page and the feed only. Only confirmed fires send a push.
- **Who can post:** only a signed-in citizen with a verified phone (decision 7), one report per few minutes, with a daily cap.
- **Automatic checks before it appears** (a few seconds, no human wait). The photo is held for staff, and not shown, when any of these is true: the file will not decode or fails the cleaning step; the AI evidence check says possible edit, generated image or a photo seen before; the position is outside the covered states; the account is new and already has a held or not-confirmed report; the text contains abuse or a phone number or link (a short blocklist). The citizen still sees "Received" and staff see why it was held.
- **If the AI check is unavailable,** the photo is not held for that reason alone, because the check is advisory and the label already says unverified. It is logged, and staff see "Evidence check unavailable".
- **Pull-down is fast.** Staff "Not confirmed", "Withdraw photo", or any citizen report-abuse tap from three different accounts removes the public copy immediately and puts it in the staff queue. Removal also deletes the file from the public bucket.
- **Safe wording** is fixed text, not the reporter's words, in the headline: "Smoke reported", "Flames reported". The reporter's note appears below it in quotes with the Unverified label.
- **Location:** the coarse grid and place name only. No exact pin, no photo location data. If a reporter's pin is within sight of a house or road junction it still shows only the area.
- **Expiry:** unverified reports disappear after 6 hours unless staff keep them; the reporter can withdraw their own report and photo at any time.
- **Risk we accept, and how we watch it:** a false or staged photo can be public for the minutes before staff react. We track how often this happens (shown public then not confirmed) and tighten the automatic checks or turn on staff pre-approval for a place or a time (a switch) if it becomes a problem.

### Tier B: "Fire confirmed near you"
(The unverified report above becomes this when staff confirm. The same photo copy is reused, relabelled.)
- Created only by staff pressing the second step in section 7.
- **Who:** citizens who opted in and whose saved area or last known position is within a radius that staff choose (default about 5 km, adjustable) of the incident, and every citizen who has the Near me page open there.
- **What the message says:** "Fire confirmed near <village or area name>. Officials are responding. <What to do>. Updated 14:20." Plain English at first. Hindi and Odia come later, once the English wording has been used in a real season and reviewed.
- **The photo:** the public copy that was already visible stays and is relabelled "Confirmed by officials"; if it was held, staff can approve it now. The shown image is a re-encoded copy with all hidden data removed, resized, and with faces and number plates blurred where found. The reporter's name is never shown. The original stays private.
- **The place:** the area on the coarse grid and a place name, never the exact pin. Staff can show an exact point for a danger zone or evacuation advice, which is a separate, deliberate choice.
- **Channels:** in the app (Near me and the notices feed) and a web push notification for installed users. SMS and local-language voice are a later phase and need the department's sender approval.
- **Limits:** at most one push per incident per person with later updates folded into the same notification, quiet hours respected except for danger-to-life, a cap on notifications per person per day, and automatic expiry (default 24 hours) unless staff renew it.
- **Updates and ending:** "Crews are responding", "Contained", or "False alarm resolved" are sent to the same people. An ending message is mandatory, so an alert never just disappears.
- **The reporter** gets a separate, personal "Your report was confirmed. Thank you." and nothing more.

### Who can raise Tier B in an emergency
Duty officers and the Control Room roles. A ranger can request it from the field, but a Control Room user confirms the broadcast.

## 9. Maps

- **Reporter:** their exact pin on their own report page, and the coarse area on Near me.
- **Other citizens:** the coarse grid areas only, from confirmed incidents (and Tier A if enabled). Distance and direction from the user's position ("about 4 km north-east").
- **Staff:** exact pins, the corroborating reports and detections, ranger positions, the day's fire danger ranking, and the layer toggles that exist now.
- **Offline:** the ranger offline map package already exists; it is extended to hold the day's open incidents.

## 10. How the AI evidence fits

- It is one input to the reviewer, shown next to the photo, in words, labelled advisory. Results are stored with the photo.
- It never decides, never publishes, never lowers a citizen's report below the queue, and never appears in citizen screens.
- Stage it in: keep shadow mode on until the phone-photo check is done and staff have compared its results with their own decisions for a few weeks. Then show it to staff only.
- When the model host is unavailable the card says "Evidence check unavailable" and the report proceeds. It must never read as a clean result.
- The check is least reliable on exactly the photos this flow gets: phone photos taken from far away, at dusk, through haze. State this in the staff help text, and use the staff decisions on these photos to build a better evaluation set.

## 11. Photos and the bucket

Everyone should be able to see the photo, quickly, without anything private leaking. So there are two kinds of stored image, in two places.

| | Original | Public copy |
|---|---|---|
| What | The photo as uploaded (after phone-side resize) | A re-encoded copy with all hidden data removed, faces and number plates blurred where found, longest side about 1,200 px |
| Who sees it | Staff only, with the AI evidence next to it | Anyone, including people not signed in, for the life of the alert |
| Where | The existing private Blob store, as now | A public-readable bucket path (Vercel Blob public objects, or an equivalent bucket), with an unguessable file name |
| When it exists | At upload | Right after the automatic checks pass (a few seconds); held for staff when a check flags it |
| Removal | Retention policy | Deleted at once when staff withdraw it, and when the alert ends the copy is deleted after a short grace period |

Why two copies: the original keeps the hidden camera data our authenticity check reads (time, device, location), and that data must never be public. The code already has a cleaning step for community images (`validate_and_reencode`) that re-encodes the pixels and drops the hidden data; the public copy reuses it and adds blurring.

Real time, on this hosting: Vercel functions cannot hold open connections, so there are no live sockets. What works well:
- The Control Room queue and incident page refresh every 10 to 15 seconds (conditional requests, so an unchanged queue costs almost nothing).
- Citizens' alert feed refreshes every 20 to 30 seconds while the screen is open; installed users also get a push the moment an alert is created or updated.
- The public copy goes into the bucket first and the card is published after, so nothing ever points at a missing image. From "photo sent" to "visible to nearby citizens" the target is under one minute; from "staff say not confirmed" to "gone from every screen" the target is under 30 seconds (the feed polls every 20 to 30 seconds, and the bucket copy is deleted straight away).
- If true live updates are wanted later, add a small managed realtime service (a hosted channel service) without changing anything else.

Unverified photos are public too, by decision of the owner: the public copy is made as soon as the automatic checks pass (section 8, Tier A), not after staff approval. The staff step stays in two places: releasing a held photo, and pulling a photo down.

## 12. What the code already gives us, and what it does not

Reuse (checked in the code):
- **Notices:** `routers_ext/notices.py` already has area polygons, regions, severity, expiry and a two-person approve step, and the citizen Near me page already reads them. A confirmed-fire alert is a notice made from an incident. It has no photo field yet and the two-person step is too slow for an emergency, so we add a photo reference and an urgent path (one authorised person publishes, a second reviews afterwards).
- **Inbox:** `/api/inbox` and the `Inbox` component already poll, so in-app alerts for each user can ride on that.
- **Satellite hotspots:** `routers_ext/feeds.py` and the Control Room map already read VIIRS active-fire detections; the corroboration match uses those.
- **Image cleaning:** `validate_and_reencode` in the community image service (above).
- **Evidence assessment, storage and the offline queue** for rangers already exist.
- **Alert kinds:** `citizen_report_received`, `report_unattended`, `incident_status_changed` already exist for staff; the escalation rules are in place.

Gaps found in the code:
- No push notifications at all: `sw.js` has no push handler, and there is no subscription table.
- The incident image upload stores the original bytes untouched and has no public-copy path.
- Large uploads fail on Vercel above about 4.5 MB, so resizing in the browser is required, not optional.
- The ranger report form creates the incident first and adds the photo after, so a failed photo leaves a report without evidence.
- Public pages only show verified areas on a delayed coarse grid, so nothing near the reporter appears quickly.
- Reports do not store place names or pin accuracy, and incidents do not link to each other, so duplicates cannot be merged.

## 13. More worth doing

Small things with a real effect, in rough order of value:
1. **Safety text that fits the situation.** A short card on every report and alert: stay upwind and uphill, do not approach, do not film from the fire's path, call 112.
2. **Phone-number check for reporters** (a one-time code). It cuts false and prank reports without asking for an identity document, and rate limits become per phone.
3. **"I'm safe" and "Need help" buttons** on the confirmation screen. They go to the Control Room only.
4. **Wind and spread hint for staff**: the what-if page already simulates spread; link the incident to it, pre-filled with the pin and the day's wind.
5. **Controlled-burn and known-activity list** staff can maintain per area. The queue shows "planned burn registered nearby", which avoids many false alarms.
6. **Smoke and air-quality note** on a confirmed alert for people downwind. Use a trusted public air-quality feed.
7. **Photo guidance in the camera screen**: "wide view with the horizon, then a close shot; wait for a steady image." It improves the AI check and the human check.
8. **Reporter feedback**: a short "what happened" note when an incident closes, written by staff in plain words. People report again when they hear back.
9. **Accessibility and low-bandwidth mode**: big targets, high contrast, text-only mode when the connection is slow, and a screen-reader-friendly status timeline.
10. **Abuse controls**: report limits per phone and per area, hidden "report this report" on public alerts, staff tools to ban an account or blur a photo quickly.
11. **Measuring ourselves**: time from report to first look, to decision, to alert; the share confirmed; how often the AI check and the reviewer agree; the false-alarm rate by source. A monthly review with the Control Room.
12. **Drills**: a monthly fake-incident drill that exercises the whole path, including the push to a test phone.
13. **Data protection**: a consent text, a retention period for originals and public copies, a deletion route for citizens, and a log of who looked at which photo. India's data protection law applies.
14. **Backups and failure plans**: if the model host, push service or bucket is down, the report still reaches the queue and the screen says what is not working.

## 14. Decisions needed from the owner

1. (Settled) Tier A is public unverified reports with labels, no push. Do you want a staff pre-approval switch available per place, as a brake?
2. Default alert radius, and who may widen it.
3. (Settled) Photos are public, labelled unverified until confirmed.
4. Channels for the first release: in-app plus web push only, or SMS as well (needs sender registration).
5. (Settled) English only for the first release. Other languages later, with a reviewer.
6. How long a citizen's saved area and last known position are kept, and the consent text (India's data protection law applies).
7. Reporter anonymity: must a citizen be signed in to report, or may someone report without an account (more reports, more abuse)?
8. The "unattended" time limits and who the next duty officer is for each state.
9. Whether to share confirmed incidents with the state forest department's existing alert system.
10. (Settled) Public unverified photos with the automatic holds in section 8. Confirm the 6-hour expiry and the daily limits.
11. Which bucket holds the public copies: a public Vercel Blob store (simplest, same account) or a separate cloud bucket (more control, an extra account and bill).
12. The urgent publish path for notices: who may publish alone in an emergency, and who reviews afterwards.

## 15. Server and data changes

Database, additions to what exists:
- `incidents`: add `place_name`, `position_accuracy_m`, `pin_source` (gps or dragged), `first_hand` (ranger), `corroboration` (summary: reporter count, detection match, computed on change), `public_state` (none, checking, confirmed, ended), `public_text` (approved wording by language), `public_photo_id`, `ended_reason`.
- `incident_links`: merged or duplicate incidents, with who linked them.
- `detections` (satellite hits near incidents, from the feed we already ingest) and a match table with distance and time.
- `notifications`: one row per alert version (incident, tier, radius, text by language, expires at, created by), and `notification_deliveries` (user, channel, sent, opened) for caps and audit.
- `push_subscriptions` (user, endpoint, keys, language, area), and `user_areas` (saved places a citizen wants alerts for), both opt-in and deletable.
- `public_photo` derivative stored apart from the original, with hash, and a record of what was removed or blurred.

API:
- Citizen: create report and attach photo in one flow with retry; nearby-duplicate lookup ("is there a report near here"); my reports with the status timeline; areas and subscription management; alerts feed for my areas.
- Staff: queue with corroboration and priority; incident merge and unmerge; decision endpoints with required reasons; prepare-alert (preview) and send-alert (second step); alert update and end.
- A background job: match new satellite detections to open incidents; recompute corroboration; expire alerts; send queued pushes.

Rules enforced on the server, not just in screens:
- A public alert exists only for an incident a staff user confirmed, and only with an explicit send.
- Public responses carry coarse position only, never the reporter id, original photo, evidence results or staff notes.
- Per-user and per-area rate limits on reports; repeated "not confirmed" reports from one account reduce its priority, never silently drop it.
- Everything audited with actor, time and outcome.

Client:
- Photo resize in the browser before upload, with a fallback if the browser cannot.
- Service-worker offline queue for reports and photos (text queue exists for rangers).
- Web push through the existing service worker.

## 16. Order of work

| Phase | What | Done when |
|---|---|---|
| 1 | Browser photo resize; photo and report sent as one flow; ranger photo in the form; retry and offline queue | A 6 MB phone photo reaches the Control Room on a slow connection |
| 1b | Public copy of each photo (clean, blur, bucket), automatic holds, unverified cards in the feed and map, withdraw and pull-down | A test photo is public and labelled within a minute, and gone within 30 seconds of a pull-down |
| 2 | Pin and accuracy on the report map, drag to correct; my reports with timeline and thumbnail; nearby-duplicate hint | A citizen can see and fix where the pin is, and link to a nearby report |
| 3 | Control Room queue redesign: cards, priority rules, evidence viewer with AI panel, decisions with reasons, merge | Staff can clear a queue of 20 incidents without opening the old pages |
| 4 | Satellite match and corroboration summary on incidents | Queue shows "reports and detections within 2 km" correctly on test data |
| 5 | Confirmed-incident alerts built on notices: prepare and send steps, urgent path, areas, in-app feed, updates and ending, approved text, and the cleaned public photo copy in the bucket | Staff send, update and end an alert; citizens in the area see all three |
| 6 | Web push and saved areas, caps, quiet hours, expiry | Installed users in the area are notified once and updated in place |
| 7 | Optional: Tier A, SMS, voice, sharing with state systems | Each approved separately |

Throughout: shadow mode stays on until the phone-photo check is done; each phase ships behind a switch; each phase has a test with real phone photos and a drill with the Control Room using fake incidents.

Not in scope: automatic dispatch, automatic public alerts without a person, showing citizens any AI result, public posting of reporter identity or exact positions.
