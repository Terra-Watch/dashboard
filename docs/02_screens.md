# RESQ UI, part 2: every page

Read `01_design_system.md` first. Every screen needs four states: loading (skeleton), empty (says what to do), error (says what happened and how to fix it), offline (where relevant). Errors never apologise and are never vague.

## 1. Site map

| Route | Page | Access |
|---|---|---|
| `/` | Landing | public |
| `/demo` | Demo (read-only map, sample dates) | public |
| `/about-forecast` | How the forecast works and its limits | public |
| `/help`, `/privacy`, `/terms`, `/contact`, `/status` | Support pages | public |
| `/login`, `/request-access`, `/forgot-password`, `/reset-password`, `/accept-invite`, `/verify-2fa` | Auth | public |
| `/onboarding` | First-run setup | signed in |
| `/app/map` | Risk map (home) | all roles |
| `/app/brief` | Daily brief | all roles |
| `/app/plan`, `/app/plan/new`, `/app/plan/:id`, `/app/plan/:id/print` | Patrol plans | officer, admin (field guard: view own) |
| `/app/alerts`, `/app/alerts/rules` | Alerts | all (rules: officer, admin) |
| `/app/incidents`, `/app/incidents/new`, `/app/incidents/:id` | Incidents | all (create: all except viewer) |
| `/app/spread` | What-if spread estimate | officer, admin |
| `/app/teams` | Teams and assets | officer, admin |
| `/app/reports` | Daily and season reports | officer, admin |
| `/app/assistant` | Assistant (full page; also a drawer) | all |
| `/app/notifications` | Notification centre | all |
| `/app/settings/*` | Profile, language, notifications, security, offline data, appearance | all |
| `/app/admin/*` | Users, approvals, regions, SOP library, fuel mapping, data and jobs, audit log, integrations | admin |
| `/403`, `/404`, `/500`, `/offline`, `/maintenance`, `/session-expired` | System pages | all |

## 2. Roles

| Capability | Viewer | Field guard | Officer | Admin |
|---|---|---|---|---|
| View map, brief, detections | yes | yes | yes | yes |
| Create and update incidents | no | yes | yes | yes |
| Assign teams | no | no | yes | yes |
| Create and share plans | no | view own | yes | yes |
| Alert rules for own region | no | no | yes | yes |
| Spread estimates | no | no | yes | yes |
| Manage users, regions, SOPs, mapping | no | no | no | yes |

## 3. Public pages

### 3.1 Landing (`/`)

Hero is the live demo map, not a stock photo.

```
+--------------------------------------------------------------+
| RESQ   How it works  Demo  Help        [Sign in] [Request access] |
+--------------------------------------------------------------+
| See where fire is most likely     |  [ demo map, six states,   |
| to start tomorrow.                |    risk bands drawing in,  |
| A daily risk map for forest       |    date chip: 14 Apr 2024 |
| teams in six states, with patrol  |    "sample data"]          |
| plans, alerts and spread          |                            |
| estimates.                        |                            |
| [Open the demo] [Request access]  |                            |
+--------------------------------------------------------------+
```

Sections, in order:
1. **Hero** as above. Headline in Noto Serif. The map accepts pan and zoom; tapping a cell shows its band and "why".
2. **The morning, in four steps** (a real sequence): Check the map. Pick priority cells. Send teams. Track what happens. Each step has a cropped screenshot, a sentence and a hairline divider, not a card.
3. **What it includes** (six rows, icon plus one sentence each): risk map, patrol plans, alerts, incident tracking, spread estimates, daily brief in five languages.
4. **Works where you work**: installs on a phone, parts work offline, five languages.
5. **Built on open data**: NASA VIIRS active fires, Copernicus ERA5-Land, NOAA GFS, OpenStreetMap and others, with a link to "How the forecast works".
6. **For each role** (three short paragraphs): range officers, control rooms, field guards.
7. **Questions** (accordion): What does "Very high" mean? Does this replace satellite alerts? (No. It adds a forecast; detections still come from satellites.) What data is used? Who can sign in? Is this an official government system? (Answer must be accurate; set it before launch.)
8. **Closing line and footer**: "Advisory forecast. Confirm with field observations." Links, attributions.

Copy rules: no accuracy claims, no promises about outcomes, no research metrics.

### 3.2 Demo (`/demo`)
The real map screen in read-only mode: sample dates only, layers limited to risk, detections, boundaries, roads and villages. Banner "Sample data from a past date." Locked features show a lock and "Sign in to use this". Priority list and cell panel work. Bottom bar: "Request access".

### 3.3 How the forecast works (`/about-forecast`)
Plain language: what goes in (satellite detections, weather, forecast weather, terrain, land cover, human activity), what comes out (a ranking of forest cells for the day), what the bands mean, what it cannot do (it does not see ignition sources, does not confirm fires, and can be wrong), and how to report a problem. No model metrics.

### 3.4 Support pages
Help (searchable FAQ and short how-to videos or illustrated steps), Privacy, Terms, Contact (form, email), Status (jobs healthy or not, last forecast time).

## 4. Authentication

- **Sign in:** email, password (show/hide), "Remember this device for 30 days", "Forgot password", "Request access", language switcher. Error: "Email or password is incorrect." After 5 failed attempts: "Too many attempts. Try again in 15 minutes." Contour-line motif on a quiet background.
- **Request access:** name, designation, department and division, state, official email, phone, reason. Result: "Request received. You will get an email when it is reviewed."
- **Forgot and reset password:** the same message whether or not the account exists. Reset link expires in 60 minutes. Password: at least 12 characters, no composition rules, block common and breached passwords.
- **Accept invite:** link valid for 48 hours; set password, choose language.
- **Two-step sign-in (TOTP):** required for admins, optional for others; show recovery codes once.
- **Session:** 12 hours with silent refresh. Expired: "Your session ended. Sign in to continue", returns to the same page.
- **Onboarding (first run):** language, home region, notification channels and quiet hours, allow notifications, install the app (phone), a three-step tour that can be skipped.

## 5. Map (`/app/map`)

Desktop:
```
+-----+-----------------------------------------------+---------------+
| nav | top bar: region | date chip | search | bell | user          |
|     +-----------------------------------------------+---------------+
|     |                                               | Priority      |
|     |           MAP (full height)                   | cells (50)    |
|     |   [layers]                       [legend]     | 1 Bargarh ... |
|     |   [locate] [zoom]                             | 2 ...         |
|     |                                               |  [Add to plan]|
+-----+-----------------------------------------------+---------------+
```
Phone:
```
+------------------------+
| date chip     search   |
|                        |
|        MAP             |
|                  [L]   |
|-- bottom sheet (peek) -|
| 50 priority cells  ^   |
+------------------------+
| Map Plan Alerts Inc ...|
+------------------------+
```

**Controls**
- **Show** (segmented): Very high / High and above / Moderate and above.
- **Priority cells** slider: 20, 50, 100, 200 (or custom). Ranks the highest cells in the selected region. Label: "Plan for your teams: top 50 cells".
- **Layers** panel: Risk, Detections (24 h, 48 h, 7 days), Incidents, Teams and bases, Boundaries, Roads, Villages, Water, Wind. Remembered per user.
- **Basemap** switch, **My location**, **Measure distance**, scale bar, compass.
- **Legend** with the four band names and the line "Bands compare cells with each other on the same day."

**Cell panel** (side panel on desktop, bottom sheet on phone), opened by tapping a cell or a list row:
1. Header: place name, district and division, band chip, rank "12 of 17,764 forest cells" (the number comes from the database).
2. **Why it is elevated**: two plain sentences from the top drivers, for example "Hot, dry spell and strong wind forecast. Fires were detected nearby in the last 14 days." Link: "How is this decided?"
3. **Forecast for this cell**: highest temperature, lowest humidity, wind speed and direction, rain (only fields the data actually has).
4. **Nearby**: detections in the last 14 days, villages and roads within 5 km, nearest water source, nearest team or base with distance.
5. **Actions:** Add to plan, Create incident here, Watch this cell (alerts), Share (link, text for WhatsApp), Ask the assistant.

**Detection panel:** time (IST), satellite, location, "Not yet verified", in a high-risk cell yes or no, actions: Create incident, Mark false alarm (officer), Estimate spread.

**Priority list view** (screen-reader and low-bandwidth friendly): sortable table of the same cells with band, place and nearest team.

**Empty and error states:** no forecast for the date ("No forecast for this date. Choose another date."); detections feed delayed ("Detections last updated 5 hours ago."); layer failed ("Roads did not load. Try again.").

## 6. Daily brief (`/app/brief`)
Region and language selectors. Sections: Priority areas (top 5 with names), Weather summary, Detections in the last 24 hours, Open incidents, Suggested focus. Footer: "Written by AI from today's data. Check before acting." Actions: copy text, share to WhatsApp, download PDF. **Preview before sharing** shows exactly what recipients will see.

## 7. Patrol plans

- **List** (`/app/plan`): date, region, teams, status (draft, shared), created by. New plan button.
- **Planner** (`/app/plan/new`): left form, right map.
  1. Region and date.
  2. Teams: choose existing teams or enter a number; set each team's base and a maximum travel time.
  3. Number of priority cells to cover.
  4. **Generate plan.** The app groups cells per team, orders each route, and draws it with distance and time.
  5. Edit: drag a cell between teams, remove a stop, re-order stops, then "Save changes".
- **Plan detail:** per team tab with a stop table (stop, place, band, what to check, distance, time) and a map. Actions: Share to team (in app, WhatsApp text), Print, Duplicate for tomorrow.
- **Print preview** (`/app/plan/:id/print`): A4, one page per team: header (team, date, region), stop table, small map, QR code that opens the plan in the app, footer "Advisory forecast. Confirm with field observations." Buttons: Download PDF, Download CSV, Print.

## 8. Alerts

- **Feed** (`/app/alerts`): newest first; filter by type (new detection in priority cell, band change, assignment); each row shows what, where, when, and actions.
- **Rules** (`/app/alerts/rules`): sentence builder: "Notify me when [a new detection appears] in [Bargarh district] in [High or Very high] cells by [email, Telegram]." Quiet hours; severity; **Preview message** and **Send test**. WhatsApp shows as "Coming soon".
- **Morning summary** toggle with time.

## 9. Incidents

- **List:** status filter, map toggle, search; columns: id, place, status, source, age, assigned team.
- **New incident** (works offline and queues): location (map pick or GPS), source (satellite detection, call, patrol, watchtower, public), estimated size (small, medium, large), access notes, photos (up to 5, compressed), notes. Save as reported.
- **Detail** (`/app/incidents/:id`):
```
+------------------------------------------------------------+
| Incident #124  Bargarh, Odisha     [Verified]  [Change status] |
+--------------------------+---------------------------------+
| map: pin, footprint,     | Timeline                        |
| teams, water, villages   |  09:12 Reported by Guard A      |
|                          |  09:30 Verified (photo)         |
| tabs: Overview | Spread  |  09:41 Team 3 assigned          |
|       | Assets | Files   |  [Add update]                   |
+--------------------------+---------------------------------+
```
  Status flow: Reported, Verified, Responding, Contained, Closed (and False alarm). Each change records who, when, and where. **Spread tab:** "Estimate spread" (see 10). **Assets tab:** villages, roads, water bodies and protected areas near the incident. Assign team shows nearest teams with distance. Assistant can draft an alert message; **nothing sends until you press "Review and send"**.

## 10. Spread estimate

- Entry points: incident detail, detection panel, or the what-if page.
- Inputs: ignition point (prefilled), start time, wind (forecast prefilled, editable), duration. **Estimate spread.**
- Progress: "Running, usually under 2 minutes" (replace with the measured time). Job can be cancelled.
- Result: footprints for 3, 6 and 12 hours on the map, Play button (off by default), wind arrow, and a list of villages, roads, water bodies and protected areas inside each footprint. Export as image or PDF.
- Always shown: "Estimated spread from an assumed fuel map. Not a prediction of actual fire behaviour."
- Error: "The estimate could not run. Check the point is inside a forest area and try again."

## 11. Teams and assets (`/app/teams`)
Tabs: Teams, Bases and check posts, Watchtowers, Water sources. Table plus map; add or edit with a form; CSV import with a preview and row-level errors; each team has members, phone numbers, vehicle, base, status (available, on patrol, off duty) that the team lead or an officer can set.

## 12. Reports (`/app/reports`)
Daily report (auto): priority cells covered, detections, incidents opened and closed. Season summary: counts of alerts sent, detections, incidents, median response time, by division. Export CSV and PDF. No model scores.

## 13. Assistant
Drawer on every page plus a full page. Context chips ("This cell", "Incident #124") can be removed. Answers about SOPs cite the document and page; if nothing is found: "This is not in the uploaded documents." Tool use is visible: "Looked up: forecast for Bargarh, 12 Mar." Thumbs up and down. History per user. Drafts show **Review and send**; the assistant never sends, assigns or closes anything.

## 14. Settings
Profile; Language and appearance; Notifications (channels, quiet hours, test); Security (password, two-step sign-in, active sessions and sign out of all); **Offline data** (download a region's map, boundaries and latest forecast, shows size and date); Install app.

## 15. Admin (`/app/admin/*`)
- **Users:** invite, approve requests, change role, deactivate, reset two-step sign-in.
- **Regions:** boundaries by state, district, division and range; assign officers.
- **SOP library:** upload PDFs; status (uploaded, indexing, ready, failed); delete.
- **Fuel mapping:** table from land-cover class to fuel class, marked "assumed", with version history. Changes need confirmation and are logged.
- **Data and jobs:** forecast job, detections feed, alert sender: last run, result, next run, Retry. Data freshness shown to users comes from here.
- **Audit log:** who did what and when; filter and export.
- **Integrations:** email sender, Telegram bot, WhatsApp provider (stub). Secrets are write-only.

## 16. System pages
403 ("You do not have access to this page. Ask an admin to change your role."), 404 ("This page does not exist. Go to the map."), 500 (what failed plus a reference code to share), offline (what still works), maintenance (expected return time), session expired.

## 17. Key flows

1. **Morning planning (officer):** sign in, read the brief, open the map for the division, set priority cells to 50, review top rows, generate plan, preview, share to teams, print.
2. **Detection to response (control room):** push notification of a detection in a High cell, open it, verify with a call or photo, create the incident, assign the nearest team, estimate spread, check villages at risk, update status until closed.
3. **Field report (guard, weak network):** open the plan, navigate to the stop, submit an incident with photo offline, see "Waiting to sync", confirm it synced later.
