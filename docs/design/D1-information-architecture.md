# D1: Information architecture

One application, one shell, one login, three roles. Navigation has at most five destinations per role. Words like "redesign", "legacy" and "saved example" do not appear in any route, label or file name.

## 1. Sitemap and navigation

### Public (no sign-in)
| Page | Content | Notes |
|---|---|---|
| Home | What TerraWatch is, safety line with emergency call, link to report, sign in | Emergency number from regional configuration (supplied by the authority) |
| Map | Verified incidents and official advisories only | Controlled by the public map policy; coarsened and delayed; values required in configuration; until set, advisories only |
| Announcements | Official notices with publisher and time | Read-only |
| Historical events | Real past incidents only | Replaces any saved-example pages |
| Community (read) | Whether the public can read posts without signing in is **undecided** | Needs your decision |
| Sign in / Create account / Reset password | See the single login | |

### Citizen (5)
1. **Home**: map, advisories, danger level for followed areas, "Report a fire" as the single primary button
2. **Report**: Where, What, Photo, Review, Sent
3. **My reports**: list and status timeline, evidence, notifications for each
4. **Community**: Posts, Chat, Rules; report abuse
5. **Account**: language, followed areas, notification preferences, consent, download or delete my data
(Notifications are a bell in the header, not a destination.)

### Control Room (5)
1. **Queue**: incidents, detections, alerts; ranked and grouped; opens the **incident workspace** (map, evidence and human review, assignments, timeline, audit)
2. **Map**: observed detections, incidents, danger level, boundaries, roads, advisories
3. **Announcements**: compose, preview, approve, publish, withdraw, history
4. **Community**: moderation queue, removals with reasons, suspensions
5. **Admin** (capability-gated sections): staff and invitations, capabilities, alert rules, audit log, reports and exports, settings

### Range Officer (4)
1. **Tasks**: assigned, accepted, done; task detail with verification form
2. **Map**: task area (saveable for offline), nearby detections, last official notice
3. **My reports**: observations I submitted and their state
4. **Account**: language, offline map areas, help contacts

## 2. Clean URLs
`/`, `/map`, `/announcements`, `/history`, `/community`, `/login`, `/signup`, `/reset`, `/invite/:token`
`/citizen/{home,report,reports,reports/:id,community,account}`
`/control-room/{queue,incidents/:id,map,announcements,community,admin/*}`
`/range-officer/{tasks,tasks/:id,map,reports,account}`
Old paths (`/redesign/*`, `/app/*`, `/staff/login`, `/citizen/login`, `/ranger`) redirect for one release, then are removed. Deferred features stay reachable only by direct URL behind a feature switch that is off.

## 3. Screen inventory (each gets wireframes and every state in D2)
| ID | Screen | Role | Primary action | Data source today [code] | New backend work |
|---|---|---|---|---|---|
| S01 | Login | all | Sign in | auth endpoints (4 today) | one endpoint |
| S02 | Create account | public | Register | `/api/auth/citizen/register` | none |
| S03 | Reset password | all | Request / complete reset | password-reset endpoints | unify |
| S04 | Accept invitation | staff | Set password | invites accept | none |
| S05 | System states (offline, maintenance, session ended, 403, 404, 500) | all | Retry | none | none |
| S10 | Citizen Home | Citizen | Report a fire | risk, advisories | danger level, followed areas |
| S11 | Report: Where | Citizen | Continue | `/api/citizen/reports` | duplicate check |
| S12 | Report: What | Citizen | Continue | same | none |
| S13 | Report: Photo | Citizen | Continue | evidence upload | resumable upload |
| S14 | Report: Review and Sent | Citizen | Send | same | submission key (exists) |
| S15 | My reports | Citizen | Open | `/api/citizen/reports` | none |
| S16 | Report detail and timeline | Citizen | Add photo | report + evidence | close reason |
| S17 | Notifications | all | Mark read | notifications | preferences |
| S18 | Community feed | Citizen | Post | `/api/community/posts` | edit, delete |
| S19 | Community chat | Citizen | Send | `/api/community/chat` | server-sent events |
| S20 | Account and privacy | Citizen | Download / delete data | none | export, deletion request |
| S30 | Queue | Control Room | Open incident | `/api/incidents`, detections, alerts | clustering |
| S31 | Incident workspace | Control Room | Decide | incident, history, assignments | close reason |
| S32 | Evidence viewer and human review | Control Room | Record review | `.../images/:id`, `.../review` | none (exists, unused in new UI) |
| S33 | Assign Range Officer | Control Room | Assign | assignments, rangers | deadline, escalation |
| S34 | Map (operations) | Control Room | Select | risk, detections | boundaries, roads |
| S35 | Announcements list and editor | Control Room | Publish | none | announcements module |
| S36 | Community moderation | Control Room | Remove or restore | community reports/archive | moderation log |
| S37 | Alerts and rules | Control Room | Acknowledge, resolve | `/api/alerts*` | scoping |
| S38 | Staff and capabilities | Control Room | Invite, grant | invites, users | capabilities |
| S39 | Audit log and exports | Control Room | Filter, export | audit-log | viewer, export |
| S40 | Situation report and handover | Control Room | Export | none | new |
| S50 | Tasks | Range Officer | Accept | `/api/ranger/assignments` | none |
| S51 | Task detail | Range Officer | Start observing | assignment | offline map |
| S52 | Observation form | Range Officer | Save | verification | multiple observations |
| S53 | Backup request | Range Officer | Request help | none | new event |
| S54 | My reports | Range Officer | View | verifications | none |
| S60 | Public Home, Map, Announcements, Historical events | public | Report / read | various | public-map policy service |

## 4. Notifications
| Event | Goes to | Today [code] | Design |
|---|---|---|---|
| Citizen report received | Control Room users **in the incident's region** | sent to all Control Room-type users | scope by region |
| Assignment created or reassigned | the Range Officer | exists | keep |
| Verification submitted | Control Room users in region | all | scope by region |
| Incident status changed | the reporting citizen | exists | plain-language text |
| Official announcement published | followers of the area | none | new |
| Assignment unacknowledged past deadline | Control Room | none | new, escalation |
| Community content reported | moderators | none | new |
Channel: in-app now. SMS and WhatsApp wait for an authorised sender. Quiet hours, preferences and rate limits are configuration.

## 5. Capabilities (draft defaults; confirm in D1 review)
| Capability | Citizen | Operator | Lead | Range Officer |
|---|---|---|---|---|
| report, comment, chat | yes | | | |
| triage, change status, assign | | yes | yes | |
| human review of evidence | | yes | yes | |
| publish announcement | | | yes | |
| moderate community | | yes | yes | |
| manage staff, view audit log | | | yes | |
| accept task, submit observation | | | | yes |
"Operator" and "Lead" are both the Control Room role; the difference is capabilities. Nothing here is a fourth role.

## 6. Offline behaviour by feature
| Feature | Offline |
|---|---|
| Report (Citizen) | Works: saved, queued, sent when connected |
| Observation (Range Officer) | Works: same |
| Task list and detail | Last synced copy, marked with its time |
| Map | Saved areas only; other areas say they are unavailable |
| Community, Announcements | Last loaded copy, marked with its time; posting waits |
| Control Room workspace | Needs a connection; shows a clear banner |
Every queued item shows one of: Waiting to send, Sending, Sent, Failed with retry.

## 7. Content and language
- All text lives in catalogues (English now; Hindi and Odia structured for later [you]). Layout is tested with long Hindi and Odia strings.
- Plain language, short sentences, no technical terms or scores shown to citizens.
- Emergency numbers, legal notices, retention statements and danger-level wording are supplied by the responsible authority; the product has placeholders that fail loudly if missing, never invented text.
