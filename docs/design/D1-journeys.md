# D1: Journeys and lifecycles

Diagrams are Mermaid text (open source; they render on GitHub and in MkDocs). **Current** diagrams reflect the code at `origin/main` `2422658` [code]. **Proposed** diagrams are design decisions for review.

---
## 1. Citizen: report a fire

```mermaid
flowchart TD
  A["Open the app"] --> B{"Signed in?"}
  B -- "No" --> L["Sign in or create an account"] --> C
  B -- "Yes" --> C["Safety line: in immediate danger, call emergency services. One-tap call button"]
  C --> D["Where: device location, map pin, or type it"]
  D --> E{"Location found?"}
  E -- "No" --> F["Pin on the map or type it. This never blocks the report"] --> G
  E -- "Yes" --> G["What did you see: fire, smoke, not sure. When. Optional note"]
  G --> H["Photo: optional, recommended. Compressed on the device"]
  H --> I["Review everything on one screen"]
  I --> J{"Connected?"}
  J -- "Yes" --> K["Send with a unique submission key"]
  J -- "No" --> M["Saved on the device. Status: Waiting to send"] --> N["Connection returns: sends automatically"] --> K
  K --> O{"Result"}
  O -- "Accepted" --> P["Sent. Reference number. What happens next"]
  O -- "Close to an existing report" --> Q["Already reported nearby. Add to it, or send as new"]
  O -- "Server problem" --> R["Not sent yet. Draft kept. Retry is safe, no duplicate"] --> K
```

| Stage | Citizen goal | Failure or offline handling | Risk to design out |
|---|---|---|---|
| Safety line | Know to call first if in danger | Emergency number comes from regional configuration; never hardcoded or invented | Citizen reports instead of calling |
| Where | Give a usable location fast | GPS denied or slow: pin or type; show accuracy | Wrong location |
| What | Say what they saw | Three plain choices; note optional | Free-text burden under stress |
| Photo | Add evidence | Compress; resumable upload; photo failure never loses the report | Large uploads on weak signal |
| Send | Be sure it went | Submission key makes retries safe; visible state at all times | Duplicate reports; silent failure |
| After | Know what happened | Status timeline, notification on change | Citizen asks again or gives up |

### What the citizen sees as the status of their report
The internal status is shown in plain language. Closure needs a structured reason (new field, see findings UX-02).

| Internal status [code] | What the citizen reads |
|---|---|
| reported | Received. Forest staff will check it. |
| verified | Confirmed by forest staff. |
| responding | Teams are responding. |
| contained | Under control. |
| closed | Closed, with the reason: resolved, not a fire, or already reported. |

Citizens never see internal notes, assessment scores, reviewer names, or other people's reports.

---
## 2. Incident lifecycle (current) [code]

```mermaid
stateDiagram-v2
  [*] --> reported
  reported --> verified
  reported --> closed
  verified --> responding
  verified --> contained
  verified --> closed
  responding --> contained
  responding --> closed
  contained --> responding
  contained --> closed
  closed --> [*]
```
Rules (unchanged): only a person changes status; nothing automatic; `closed` is final. **Proposed addition**: closing requires a reason from a fixed list plus an optional note, and reopening is not allowed (a new report is linked instead).

---
## 3. Control Room: triage to close

```mermaid
flowchart TD
  A["New report or detection arrives"] --> B["Queue: ranked, grouped with nearby reports and detections"]
  B --> C["Open the incident workspace: map, evidence, history"]
  C --> D["View the photo. Record a human review: genuine, may be fake or edited, or seen"]
  D --> E{"Decision"}
  E -- "Not credible" --> F["Close with a reason"]
  E -- "Needs a check" --> G["Assign a Range Officer in scope"]
  E -- "Credible" --> H["Mark verified"]
  G --> I["Officer accepts or declines"]
  I -- "Declines" --> G
  I -- "Accepts" --> J["Field observations arrive"]
  J --> K{"Observation"}
  K -- "Confirmed" --> H
  K -- "Not confirmed" --> F
  K -- "Inconclusive" --> G
  H --> M["Responding, then contained"] --> N["Close with a reason"]
  M --> P["Publish an official notice if the public must act"]
```
Every arrow that changes status is a person's click with a recorded reason. The photo assessment, if enabled later, is advisory and cannot move any arrow.

---
## 4. Assignment and field verification

**Current** [code]: a verification can be submitted from `assigned`, and any verification, even "inconclusive", completes the assignment at once.

```mermaid
stateDiagram-v2
  [*] --> assigned
  assigned --> accepted
  assigned --> cancelled: declined or reassigned
  accepted --> in_progress
  accepted --> cancelled: reassigned
  in_progress --> cancelled: reassigned
  assigned --> completed: any verification submitted
  accepted --> completed: any verification submitted
  in_progress --> completed: any verification submitted
```

**Proposed**: accept first; allow several observations; completion is an explicit action; "need backup" is its own event.

```mermaid
stateDiagram-v2
  [*] --> assigned
  assigned --> accepted: officer accepts
  assigned --> declined: officer declines, reason required
  accepted --> observing: first observation saved
  observing --> observing: add observation or photo
  observing --> completed: officer marks complete
  accepted --> completed: officer marks complete
  assigned --> cancelled: Control Room cancels or reassigns
  accepted --> cancelled: Control Room cancels or reassigns
  observing --> cancelled: Control Room cancels or reassigns
```
Observation outcomes stay `confirmed`, `not_confirmed`, `inconclusive` [code]. An observation never changes the incident's status; it notifies the Control Room.

---
## 5. Range Officer: field journey (offline-first)

```mermaid
flowchart TD
  A["Open Tasks"] --> B["Task card: place, urgency, time since assigned"]
  B --> C{"Accept?"}
  C -- "Decline" --> D["Reason, then back to Tasks"]
  C -- "Accept" --> E["Task detail: map area saved on the device, navigation link, last official notice"]
  E --> F["Travel. Need backup: one action"]
  F --> G["On site: observation form. Outcome, notes, time, photos"]
  G --> H{"Connected?"}
  H -- "Yes" --> I["Saved and sent. Shown as Sent"]
  H -- "No" --> J["Saved on the device. Shown as Waiting to send"] --> K["Sends when signal returns. Conflicts reported to the officer, never lost"]
  I --> L{"Anything more to add?"}
  K --> L
  L -- "Yes" --> G
  L -- "No" --> M["Mark complete"]
```

---
## 6. Official announcement (proposed, new feature)

```mermaid
stateDiagram-v2
  [*] --> draft
  draft --> pending_approval: author submits
  pending_approval --> draft: returned with comments
  pending_approval --> published: approver with publish capability approves
  published --> withdrawn: approver withdraws, reason recorded
  published --> expired: end time reached
```
Rules: the author cannot approve their own message; text written or suggested by software is only ever a draft and needs a named person's approval; publisher, approver and times are stored and shown; edits after publication create a visible revision; templates and language versions are prepared in advance.

---
## 7. Community (inside Citizen)

**Current** [code]: posts (up to 2000 characters), comments, area chat by polling, report and archive actions for staff. **No edit or delete for the author.**

```mermaid
stateDiagram-v2
  [*] --> visible: posted
  visible --> reported: another member reports it
  reported --> visible: moderator keeps it
  reported --> removed: moderator removes, reason recorded
  visible --> deleted_by_author: author deletes (proposed)
  removed --> visible: moderator restores
```
Rules: Community content is always labelled "Not official information"; it is visually and structurally separate from official announcements and incident reports; chat messages carry sender and time; limits on rate and size; mute and block; moderation actions are audited. Chat transport moves from 5-second polling to server-sent events, falling back to 15-second cursor polling.

---
## 8. One login for everyone

```mermaid
flowchart TD
  A["Open /login"] --> B["Email and password"]
  B --> C{"Valid?"}
  C -- "No" --> D["Plain error. Lockout and rate limit after repeated failures"] --> B
  C -- "Yes" --> E{"Second factor required? (Control Room, if enabled)"}
  E -- "Yes" --> F["Enter code"] --> G
  E -- "No" --> G["Server returns the role"]
  G --> H["Citizen: Home"]
  G --> I["Control Room: Queue"]
  G --> J["Range Officer: Tasks"]
  A --> K["Create a citizen account"] --> B
  A --> L["Forgot password"] --> M["Reset link sent. Same message whether or not the email exists"] --> B
  N["Staff invitation link"] --> O["Set password, accept invitation"] --> B
```
There is no "choose your workspace" step. Staff accounts exist only by invitation.
