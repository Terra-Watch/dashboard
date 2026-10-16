# D0: Role briefs

Three roles. Capabilities (what a person may do) sit underneath and are granted per person; they are not roles.

---
## 1. Citizen

**Who** [you]: someone living near a forest who could report a suspected wildfire. [assumption] Three situations, one account:
- *Witness*: sees smoke or fire now; stressed, in a hurry, possibly with poor signal.
- *Resident*: checks danger and official advice; wants alerts for their area.
- *Community member*: reads and posts local discussion.

**Context** [assumption, confirm by interview]: phone first, probably a low-cost Android device; intermittent mobile network [you]; daylight glare or darkness; may have limited reading comfort in English. English first, Hindi and Odia designed in [you].

**Jobs to be done**
| ID | When... | I want to... | So that... |
|---|---|---|---|
| C1 | I see smoke or fire | tell the authorities where and what, in seconds | someone checks it |
| C2 | I have reported | know it arrived and what happened next | I do not wonder or report twice |
| C3 | danger is high or a fire is near | read trustworthy official information and what to do | I protect myself and others |
| C4 | I live near a forest | talk with neighbours and see local updates | I stay informed, without mistaking chat for official advice |
| C5 | I have given my location and photos | control and delete my data | I can trust the service |

**Must be able to**: report with no account friction beyond sign-in; report offline and have it send later; see only their own reports and the public view; post, comment and chat in Community; follow areas; request their data or its deletion.
**Must never**: see others' reports or unverified incidents; see precise operational locations; see model scores or internal notes; change any status; mistake Community content for official information.

**Today** [code]
- Report wizard exists (where, what, photo) with device location or manual entry.
- Community access was restored in `main` (FEAT-001); the offline queue now covers reports (FEAT-003) and evidence viewing and notifications were added (FEAT-002). All three need end-to-end verification on a real database before they are called done.
- No emergency numbers are shown; the safety line says to "contact local emergency services".
- Community has no edit or delete for your own post (0 endpoints); chat polls every 5 seconds.
- The citizen map was reported as a placeholder in the earlier audit (`.agents/tasks/audit`); that needs re-checking against the current code.
- Notifications exist as a list; no preferences, no followed areas.

**Risks**: false or malicious reports; photos and location are sensitive; misinformation in chat; false reassurance; liability if wording implies a promise of safety.

**Interview questions (real citizens)**: What would you do if you saw smoke? Who would you tell, and how? What stops you reporting? What do you expect to hear back, and how fast? Which language do you read most easily? What information about fire do you trust, from whom? Would you use a community chat, and what would worry you about it?

---
## 2. Control Room

**Who** [you: "someone experienced in incident monitoring and response coordination"; the organisation is unconfirmed]. [assumption] Two modes: *operators* on shift triaging and coordinating; *leads* who authorise official communications, manage staff and review the record.

**Context** [assumption]: desk, one or more large screens, long sessions, bursts of pressure, several incidents at once, handover between shifts, phone and radio running in parallel.

**Jobs to be done**
| ID | When... | I want to... | So that... |
|---|---|---|---|
| R1 | reports and detections arrive | see them ranked, grouped and checked against each other | I act on real events first |
| R2 | an event looks real | assign a Range Officer and see acceptance and progress | nothing is left unanswered |
| R3 | something is happening | see the map, detections and danger level with their sources and times | I trust what I see |
| R4 | the public needs to know | write, check and publish an official notice | people get one authoritative message |
| R5 | Community content causes harm | review, remove or restore with a reason | discussion stays safe |
| R6 | the shift changes or a review happens | keep and hand over an auditable record | continuity and accountability |
| R7 | staff join or leave | invite, grant capabilities and remove access | only the right people can act |

**Must be able to**: review the evidence (view the photo, record a human review); change an incident's status; assign and reassign; publish announcements (with capability); moderate; view the audit log (with capability).
**Must never**: have a status changed by a model; publish AI-written text without a person's approval; see or act outside their region where scope applies.

**Today** [code]
- The new incident screen shows the photo's *filename* only, and "Human review: NOT_REVIEWED" as read-only text. The only screen that can record a human review or show the photo is the legacy staff area.
- For Control Room users, alerts, alert rules, notifications, admin overview, reports summary and settings exist only in the legacy area.
- Every citizen report and verification notification goes to **all** Control Room users, with no region filter.
- Closing an incident takes only an optional free-text note; there is no structured reason.
- No duplicate grouping, no announcements, no handover notes.

**Risks**: alert overload; wrong dispatch; publishing an unapproved message; operating outside scope.

**Interview questions**: How do reports reach you now? How do you decide something is real? What do you check first? How do you tell the public today, and who approves? What does a handover contain? What goes wrong most often during a busy shift?

---
## 3. Range Officer

**Who** [you: "a forest field officer who can verify incidents and submit field reports"].

**Context** [assumption]: outdoors, on foot or vehicle, sun glare, gloves, one hand free, low battery, weak or no signal, urgency; local language.

**Jobs to be done**
| ID | When... | I want to... | So that... |
|---|---|---|---|
| F1 | a task is assigned | see where, how urgent, and accept or decline quickly | the Control Room knows my status |
| F2 | I head out | get to the location | I arrive fast |
| F3 | I am on site | record what I found, with photos and notes, even offline | the Control Room can decide |
| F4 | I need help | ask for backup in one action | I am not alone |
| F5 | conditions change | see the latest official notice | I follow the current instruction |

**Must be able to**: accept or decline; record one or more observations; attach photos; work offline and sync safely; ask for help.
**Must never**: change an incident's status (that is the Control Room's decision); see assignments that are not theirs.

**Today** [code]
- Submitting *any* verification, even "inconclusive", immediately marks the assignment `completed`, and it can be done without first accepting. A second visit cannot be recorded.
- The verification route accepts the role string `field_crew` only; the image-review route accepts `range_officer`. The two names are used inconsistently.
- Offline queue now exists for verifications (FEAT-003, to be verified).
- No offline map area; the service worker has no offline page.

**Risks**: unsafe situations; data entered under stress; sync conflicts; being asked to do work that is not theirs.

**Interview questions**: Describe your last verification from call to report. Where do you lose signal? What do you record, in what order? What would make you trust the app enough to rely on it? How do you ask for backup now?
