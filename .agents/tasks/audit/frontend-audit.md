# TerraWatch Frontend Audit Report

**Date:** 2024-10-16  
**Scope:** Complete read-only audit of frontend at `/Users/kireeti/Desktop/Projects/RESQ/website/frontend/src/`  
**Total Source Files:** 73 TypeScript/React files  

---

## Executive Summary

The TerraWatch frontend consists of **three parallel UI architectures** serving different user roles:

1. **Legacy Staff Workspace** (`/app/*`) — Original operational interface, uses legacy routing and styling
2. **Redesign Portal** (`/redesign/*`, `/citizen/*`, `/ranger/*`, `/control-room/*`) — Modern role-based apps with improved UX
3. **Public Portal** (`/`, `/community`, `/demo`) — Public-facing landing and community features

**Critical Finding:** The Citizen interface has no navigation or route to access Community/Chat features despite explicit UI promises and backend API endpoints being present. This is a **P0 integration gap**.

**Status:** Extensive feature overlap and competing implementations exist. Data flow is generally intact for core incident reporting, but UI consistency, navigation clarity, and cross-role integration have significant defects.

---

## A. Complete Route Inventory

### Legacy Staff Routes (`/app/*`)

| Route | File | Role | Purpose | APIs Called | Persistence | Error Handling | Works? | Issues |
|-------|------|------|---------|-------------|-------------|----------------|--------|--------|
| `/app/map` | `pages/MapPage.tsx` | officer, admin | Primary map view with risk layer | `/api/risk/daily?target={date}` | None (read-only) | Basic fetch error | ✓ Partial | Uses saved data fallback, no live feed indicated |
| `/app/brief` | `pages/BriefPage.tsx` | officer, admin | Daily priority briefing | `/api/risk/daily?target={date}` | None | Basic fetch error | ✓ Partial | Reads saved historical data, weather/incidents show "unavailable" |
| `/app/plan` | `features/operations/PlanListPage.tsx` | officer, admin | Patrol plan list | Not visible in audit | Unknown | Unknown | ⚠️ Unknown | Route guarded but implementation not fully audited |
| `/app/plan/new` | `pages/InteractivePages.tsx` → `PlanPage` | officer, admin | Create patrol plan | Not visible | Unknown | Unknown | ⚠️ Unknown | Interactive page placeholder |
| `/app/alerts` | `pages/InteractivePages.tsx` → `AlertsPage` | officer, admin | Alert notifications | Not visible | Unknown | Unknown | ⚠️ Unknown | Interactive page placeholder |
| `/app/alerts/rules` | `pages/InteractivePages.tsx` → `AlertRulesPage` | officer, admin | Configure alert rules | Not visible | Unknown | Unknown | ⚠️ Unknown | Interactive page placeholder |
| `/app/incidents` | `features/operations/IncidentsListPage.tsx` | officer, admin | Incident list & triage | `/api/incidents`, `/api/incidents/{id}/status`, `/api/incidents/{id}/images`, `/api/incidents/{id}/images/{imageId}/review` | ✓ PATCH status, POST review | ApiError class with status codes | ✓ Yes | Human review workflow complete, assessment display updated |
| `/app/incidents/new` | `features/operations/IncidentsPage.tsx` | officer, admin | Create new incident | `/api/incidents`, `/api/incidents/{id}/images` | ✓ POST creates incident, uploads image | Network failure → offline queue | ✓ Yes | Offline queue works; assessment messages updated |
| `/app/spread` | `pages/InteractivePages.tsx` → `SpreadPage` | officer, admin | Fire spread simulation | Not visible | Unknown | Unknown | ⚠️ Unknown | Interactive page placeholder |
| `/app/assistant` | `pages/InteractivePages.tsx` → `AssistantPage` | officer, admin | AI assistant (SOP help) | None | None | None | ✗ No | Displays "No assistant knowledge base is connected" |
| `/app/settings` | `pages/InteractivePages.tsx` → `SettingsPage` | all staff | User settings | Not visible | Unknown | Unknown | ⚠️ Unknown | Interactive page placeholder |
| `/app/notifications` | `pages/InteractivePages.tsx` → `NotificationsPage` | all staff | Notification center | Not visible | Unknown | Unknown | ⚠️ Unknown | Toolbar link present |
| `/app/admin` | `features/operations/AdminPage.tsx` | admin only | Admin dashboard | Not visible in audit | Unknown | Unknown | ⚠️ Unknown | Admin-only guarded route |
| `/app/reports` | `features/operations/ReportsPage.tsx` | officer, admin | Reporting dashboard | Not visible in audit | Unknown | Unknown | ⚠️ Unknown | Reports feature |

### Redesign Public Routes

| Route | File | Role | Purpose | APIs Called | Persistence | Error Handling | Works? | Issues |
|-------|------|------|---------|-------------|-------------|----------------|--------|--------|
| `/` | `redesign/pages/PublicPortal.tsx` → `PublicLandingPage` | public | Public landing page | None | None | None | ✓ Yes | Clean entry point with role cards |
| `/community` | `redesign/pages/PublicPortal.tsx` → `CommunityPage` | public (auth optional) | Community discussion & chat | `/api/community/posts`, `/api/community/chat` | ✓ POST creates posts/messages | try/catch with user message | ✓ Yes | Polling every 5s for chat, requires auth to post |
| `/community/archive` | `redesign/pages/PublicPortal.tsx` → `PublicArchivePage` | public | Historical archive & demo | `/api/community/posts?archived=true`, saved offline data | None | Silent fail on community fetch | ✓ Yes | Combines archived posts + offline demo |
| `/demo` | `redesign/pages/OfflineDemoPage.tsx` | public | Offline saved demo | Saved JSON from `/demo/` directory | None | None | ✓ Yes | Static saved data display |

### Redesign Citizen Routes (`/citizen/*`)

| Route | File | Role | Purpose | APIs Called | Persistence | Error Handling | Works? | Issues |
|-------|------|------|---------|-------------|-------------|----------------|--------|--------|
| `/citizen` | `redesign/pages/CitizenApp.tsx` → `CitizenHomePage` | citizen | Citizen dashboard | None | None | None | ✓ Yes | Landing with action cards |
| `/citizen/map` | `redesign/pages/CitizenApp.tsx` → `CitizenMapPage` | citizen | Public fire map | None (placeholder) | None | None | ⚠️ Placeholder | Shows "No public map source connected" |
| `/citizen/report` | `redesign/pages/CitizenApp.tsx` → `ReportWizard` | citizen | Fire report wizard | `/api/citizen/reports`, `/api/citizen/reports/{id}/evidence` | ✓ POST report + evidence | try/catch, network/server separation | ✓ Yes | 4-step wizard, map picker, image upload works |
| `/citizen/reports` | `redesign/pages/CitizenApp.tsx` → `CitizenReportsPage` | citizen | User's report list | `/api/citizen/reports` | None (read-only) | Error message display | ✓ Yes | Lists user's reports with status |
| `/citizen/reports/{id}` | `redesign/pages/CitizenApp.tsx` → `CitizenReportDetailPage` | citizen | Report detail view | `/api/citizen/reports/{id}` | None | Error message display | ✓ Yes | Shows report + evidence assessment |
| `/citizen/safety` | `redesign/pages/CitizenApp.tsx` → `CitizenSafetyPage` | citizen | Safety guidance | None | None | None | ✓ Yes | Static safety content |
| `/citizen/community*` | `redesign/pages/CitizenApp.tsx` → `CitizenUnavailablePage` | citizen | Community access | None | None | None | ✗ **BROKEN** | **P0: Route exists but returns "unavailable" message** |
| `/citizen/profile` | `redesign/pages/CitizenApp.tsx` → `CitizenUnavailablePage` | citizen | User profile | None | None | None | ⚠️ Placeholder | Shows unavailable message |
| `/citizen/login` | `redesign/pages/CitizenAuthPage.tsx` | public | Citizen auth | `/api/auth/citizen/login` | ✓ Sets token + user | try/catch with message | ✓ Yes | Login + register modes |
| `/citizen/register` | `redesign/pages/CitizenAuthPage.tsx` | public | Citizen registration | `/api/auth/citizen/register` | ✓ Sets token + user | try/catch with message | ✓ Yes | Registration flow |

### Redesign Ranger Routes (`/ranger/*`)

| Route | File | Role | Purpose | APIs Called | Persistence | Error Handling | Works? | Issues |
|-------|------|------|---------|-------------|-------------|----------------|--------|--------|
| `/ranger` | `redesign/pages/RangerApp.tsx` → `RangerHomePage` | field_crew | Ranger dashboard | `/api/ranger/assignments` | None | React Query retry + error UI | ✓ Yes | Shows assigned tasks, drafts, online status |
| `/ranger/incidents` | `redesign/pages/RangerApp.tsx` → `RangerIncidentsPage` | field_crew | Incident task list | `/api/ranger/assignments` | None | React Query error state | ✓ Yes | Searchable task list |
| `/ranger/incidents/{id}` | `redesign/pages/RangerApp.tsx` → `RangerIncidentPage` | field_crew | Task detail + actions | `/api/ranger/assignments/{id}/decision` | ✓ POST decision | try/catch with message | ✓ Yes | Accept/decline/start + evidence upload |
| `/ranger/reports` | `redesign/pages/RangerApp.tsx` → `RangerReportsPage` | field_crew | Report history | Device-only queue + session confirmations | Local storage | None | ⚠️ Limited | No backend history endpoint, shows local drafts only |
| `/ranger/reports/new` | `redesign/pages/RangerApp.tsx` → `RangerReportComposer` | field_crew | Field verification form | `/api/ranger/assignments/{id}/verification` | ✓ POST verification | try/catch, offline detection | ✓ Yes | 3-step wizard with outcome + notes |
| `/ranger/evidence` | `redesign/pages/RangerApp.tsx` → `RangerEvidencePage` | field_crew | Evidence upload | `/api/ranger/assignments/{id}/evidence` | ✓ POST evidence | try/catch with message | ✓ Yes | Upload + assessment feedback |

### Redesign Control Room Routes (`/control-room/*`)

| Route | File | Role | Purpose | APIs Called | Persistence | Error Handling | Works? | Issues |
|-------|------|------|---------|-------------|-------------|----------------|--------|--------|
| `/control-room` | `redesign/pages/ControlRoomApp.tsx` → `ControlRoomHome` | control_room_operator, incident_commander, admin | Operational overview | `/api/incidents` | None | try/catch display | ✓ Yes | Metrics + queue summary |
| `/control-room/incidents` | `redesign/pages/ControlRoomApp.tsx` → `ControlRoomIncidents` | control_room_operator, incident_commander, admin | Incident queue | `/api/incidents` | None | try/catch display | ✓ Yes | Search + filter by status |
| `/control-room/incidents/{id}` | `redesign/pages/ControlRoomApp.tsx` → `ControlRoomIncident` | control_room_operator, incident_commander, admin | Incident review & workflow | `/api/incidents/{id}`, `/api/incidents/{id}/history`, `/api/control-room/incidents/{id}/assignments`, `/api/control-room/rangers`, `/api/incidents/{id}/status`, `/api/control-room/incidents/{id}/assignments` | ✓ PATCH status, POST assignments | try/catch with feedback | ✓ Yes | Full workflow: status transitions, ranger assignment, evidence review, verification history, audit log |

### Redesign Saved Examples (`/redesign/*`)

| Route | File | Role | Purpose | APIs Called | Persistence | Error Handling | Works? | Issues |
|-------|------|------|---------|-------------|-------------|----------------|--------|--------|
| `/redesign` | `redesign/RedesignRoot.tsx` → `LandingPage` | public (+ staff) | Example landing | Saved archive JSON | None | Silent fallback | ✓ Yes | Shows saved map data |
| `/redesign/today` | `redesign/RedesignRoot.tsx` → `TodayPage` | public (+ staff) | Historical risk ranking | `/api/risk/geojson` fallback to saved archive | None | Fallback to archive | ✓ Yes | Displays saved risk ranking |
| `/redesign/watch` | `redesign/RedesignRoot.tsx` → `WatchPage` | public (+ staff) | Historical reports | Not visible in audit | Unknown | Unknown | ⚠️ Unknown | Saved example route |
| `/redesign/incident/{id}` | `redesign/RedesignRoot.tsx` → `IncidentPage` | public (+ staff) | Historical incident detail | Saved case JSON fallback | None | Fallback to saved data | ✓ Yes | Shows saved incident + spread simulation |
| `/redesign/simulation` | `redesign/RedesignRoot.tsx` → `SimulationLabPage` | public (+ staff) | Saved spread simulation | Saved simulation manifest + output | None | React Query error | ✓ Yes | Displays saved simulation runs |
| `/redesign/field` | `redesign/RedesignRoot.tsx` → `FieldPage` | field_crew | Field notes (saved example) | `/api/field/queue`, `/api/field/reports` | ✓ POST reports | React Query error | ⚠️ Partial | Field queue API may not be fully operational |

### Authentication Routes

| Route | File | Role | Purpose | APIs Called | Persistence | Error Handling | Works? | Issues |
|-------|------|------|---------|-------------|-------------|----------------|--------|--------|
| `/staff/login` | `components/Login.tsx` | public | Staff login | `/api/auth/redesign/login` | ✓ Sets token + user | ApiError display | ✓ Yes | Workspace routing after auth |
| `/login` | `app/App.tsx` | public | Legacy login redirect | Redirects to `/staff/login` | N/A | None | ✓ Yes | Compatibility redirect |
| `/citizen/login` | `redesign/pages/CitizenAuthPage.tsx` | public | Citizen login | `/api/auth/citizen/login` | ✓ Sets token + user | try/catch display | ✓ Yes | Separate citizen auth |
| `/citizen/register` | `redesign/pages/CitizenAuthPage.tsx` | public | Citizen registration | `/api/auth/citizen/register` | ✓ Sets token + user | try/catch display | ✓ Yes | Citizen registration |

### Error/System Routes

| Route | File | Role | Purpose | APIs Called | Persistence | Error Handling | Works? | Issues |
|-------|------|------|---------|-------------|-------------|----------------|--------|--------|
| `/403` | `pages/SystemPage.tsx` or `ForbiddenPage.tsx` | all | Access denied | None | None | N/A | ✓ Yes | Permission error page |
| `/404`, `/500`, `/offline`, `/maintenance`, `/session-expired` | `pages/SystemPage.tsx` | all | Error states | None | None | N/A | ✓ Yes | System error pages |
| `/request-access` | `pages/RequestAccessPage.tsx` | public | Access request form | `/api/auth/access-requests` | ✓ POST request | try/catch display | ⚠️ Limited | Form exists but backend may not process |

---

## B. Navigation Map

### Legacy Staff Navigation (`/app/*`)

**Source:** `app/config.ts` `pages` array + `app/App.tsx` sidebar rendering

**Primary Navigation (Sidebar):**
- Map → `/app/map` (all staff)
- Brief → `/app/brief` (all staff)
- Plan → `/app/plan` (officer, admin only — UI filtered)
- Alerts → `/app/alerts` (all staff)
- Incidents → `/app/incidents` (all staff)
- Settings → `/app/settings` (all staff)

**Additional Links:**
- Notifications → `/app/notifications` (topbar bell icon)
- Admin → `/app/admin` (admin only — guarded)
- "New Redesign Portal" → `/redesign` (sidebar footer)

**Role-Based Filtering:**
- Plan page filtered out of navigation for non-officer/admin roles (line 142 of App.tsx)
- Admin page access guarded in route logic (line 145 of App.tsx)

**Mobile Navigation:**
- Bottom tabs show first 5 pages only (line 152 of App.tsx)

### Redesign Public Navigation

**Source:** `redesign/pages/PublicPortal.tsx` `PublicLayout`

**Header Links:**
- Community → `/community`
- Citizen → `/citizen`
- Archive → `/community/archive`
- Staff sign in → `/staff/login`

**Landing Page Cards:**
- "Continue as Citizen" → `/citizen/login`
- "Ranger Login" → `/staff/login`
- "Control Room Login" → `/staff/login?workspace=control-room`

### Citizen Navigation

**Source:** `redesign/pages/CitizenApp.tsx` `CitizenShell`

**Desktop Header:**
- Home → `/citizen`
- Fire Map → `/citizen/map`
- Report → `/citizen/report`
- My Reports → `/citizen/reports`
- Stay safe → `/citizen/safety`
- TerraWatch home → `/`

**Mobile Bottom Tabs:**
- Home → `/citizen` (⌂)
- Fire Map → `/citizen/map` (⌖)
- Report → `/citizen/report` (＋)
- My Reports → `/citizen/reports` (▤)

**CRITICAL DEFECT:** No navigation link to `/community` or any community/chat feature exists in the Citizen navigation, despite:
- The public landing page promising "community discussions" in the Citizen card description
- The `/citizen/community*` route existing (line 180 of CitizenApp.tsx)
- Backend APIs `/api/community/posts` and `/api/community/chat` being functional
- Community features being fully accessible at `/community` for public/authenticated users

### Ranger Navigation

**Source:** `redesign/pages/RangerApp.tsx` `RangerShell`

**Mobile Bottom Tabs:**
- Home → `/ranger` (⌂)
- Incidents → `/ranger/incidents` (⌖)
- Reports → `/ranger/reports` (▤)
- Profile → `/ranger#profile` (●)

**Action Buttons (contextual):**
- "Record observation" → `/ranger/reports/new`
- "Capture evidence" → `/ranger/evidence`
- "Open assignment" → `/ranger/incidents/{id}`

### Control Room Navigation

**Source:** `redesign/pages/ControlRoomApp.tsx` `ControlShell`

**Header Navigation:**
- Overview → `/control-room`
- Incident queue → `/control-room/incidents`
- Saved examples → `/redesign/today`
- Sign out → `/staff/login`

**Action Buttons:**
- "Open incident queue" → `/control-room/incidents`
- "Review incident" → `/control-room/incidents/{id}`

### Redesign Root Navigation

**Source:** `redesign/RedesignRoot.tsx`

**Top Navigation (for saved examples):**
- Home → `/redesign`
- Historical ranking → `/redesign/today`
- Reports → `/redesign/watch`
- Possible spread → `/redesign/incident/E2023-084925`
- Saved spread example → `/redesign/simulation`
- Field notes → `/redesign/field`
- Ranger field work → `/ranger`
- Saved archive → `/demo`

**Role-Based Filtering:**
- Filters navigation items by `canAccessRedesignPath(path, user.role)` (line 44 of RedesignRoot.tsx)
- `/redesign/simulation` hidden for unauthenticated users (line 44)

---

## C. Legacy vs Redesign vs Demo Overlap Analysis

### Competing Implementations

#### 1. Incident List/Review

**Legacy:**
- Route: `/app/incidents`
- File: `features/operations/IncidentsListPage.tsx`
- Features: Full triage workflow, image assessment display, human review submission, status transitions
- Assessment Display: Uses `presentAssessment()` helper, shows experimental outputs
- Status: **✓ Fully functional**

**Redesign:**
- Route: `/control-room/incidents`
- File: `redesign/pages/ControlRoomApp.tsx` → `ControlRoomIncidents`
- Features: Search, filter, metrics, full workflow on detail page
- Assessment Display: Uses same `presentAssessment()` helper
- Status: **✓ Fully functional**

**Overlap:** Both provide complete incident triage. Legacy is staff-workspace-scoped; redesign is control-room-scoped. No data conflicts, but two parallel implementations of the same workflow.

#### 2. Incident Creation

**Legacy:**
- Route: `/app/incidents/new`
- File: `features/operations/IncidentsPage.tsx`
- Features: Form with state/source/size/notes, image upload, offline queue, assessment feedback
- Status: **✓ Fully functional**

**Redesign:**
- Route: *Not present in Control Room*
- Alternative: Citizen reporting at `/citizen/report`
- Status: Control Room operators create incidents via legacy route only

**Overlap:** Legacy is the only operational incident creation for staff. Citizen reporting is separate workflow.

#### 3. Map/Risk Display

**Legacy:**
- Route: `/app/map`
- File: `pages/MapPage.tsx`
- Data: `/api/risk/daily?target={date}` with saved fallback
- Status: **✓ Partial** (saved data only)

**Redesign:**
- Route: `/redesign/today`
- File: `redesign/pages/TodayPage.tsx`
- Data: `/api/risk/geojson?target={date}&state={state}` with archive fallback
- Status: **✓ Partial** (saved data only)

**Redesign (Public):**
- Route: `/redesign` → `LandingPage`
- File: `redesign/pages/LandingPage.tsx`
- Data: Saved archive JSON only
- Status: **✓ Yes** (static demo)

**Overlap:** Three separate map views with different data sources and fallback strategies. No single "live map" indicated.

#### 4. Field/Ranger Workflows

**Legacy:**
- Route: None (field workflows not in legacy)

**Redesign:**
- Route: `/ranger/*`
- File: `redesign/pages/RangerApp.tsx`
- Features: Assignment management, verification submission, evidence upload, offline drafts
- Status: **✓ Fully functional**

**Redesign (Saved Example):**
- Route: `/redesign/field`
- File: `redesign/pages/FieldPage.tsx`
- Features: Field queue and report submission (demonstration)
- Status: **⚠️ Partial** (may be demo-only)

**Overlap:** `/ranger/*` is the operational field interface. `/redesign/field` appears to be a saved example or alternative API.

#### 5. Community/Chat

**Public Portal:**
- Route: `/community`
- File: `redesign/pages/PublicPortal.tsx` → `CommunityPage`
- Features: Public discussion posts + member chat (auth required to post)
- APIs: `/api/community/posts`, `/api/community/chat`
- Status: **✓ Fully functional**

**Citizen:**
- Route: `/citizen/community*` exists but returns "unavailable"
- File: `redesign/pages/CitizenApp.tsx` line 180
- Status: **✗ BROKEN** — route trap with no implementation

**Overlap:** Community is accessible at `/community` but Citizen users have no link to reach it. The "CITIZEN / COMMUNITY" card on the landing page is misleading.

### Demo vs Operational Separation

**Demo Routes (clearly labelled as saved/historical):**
- `/demo` — saved offline demo
- `/community/archive` — archived community posts + demo
- `/redesign/*` (most routes) — saved examples with banner: "Saved examples only"

**Operational Routes:**
- `/app/*` — legacy staff workspace (live APIs + saved fallbacks)
- `/citizen/*` — citizen application (live APIs)
- `/ranger/*` — ranger field operations (live APIs)
- `/control-room/*` — control room operations (live APIs)
- `/community` — live community discussion

**Clarity:** Demo routes are well-labelled. Risk/map routes use fallbacks but display banners. No user confusion expected between demo and operational contexts.

---

## D. Community/Citizen Integration Root Cause Analysis

### The Gap

**User expectation:** Public landing page describes Citizen entry point as: *"Report fires and access public fire information, community discussions, reporting, and safety guidance."*

**Reality:** The Citizen interface (`/citizen/*`) has:
- ✓ Report fires (`/citizen/report`) — works
- ✓ Public fire information (`/citizen/map`) — placeholder, clearly marked
- ✗ **Community discussions** — **no navigation, route exists but shows "unavailable"**
- ✓ Reporting (`/citizen/reports`) — works
- ✓ Safety guidance (`/citizen/safety`) — works

### Code Path Analysis

#### What Exists

1. **Community Backend APIs:**
   - `/api/community/posts` (GET, POST)
   - `/api/community/chat` (GET, POST)
   - Working implementation visible in `PublicPortal.tsx` lines 80-112

2. **Community Frontend:**
   - Route: `/community`
   - Component: `CommunityPage` → `CommunityDiscussion`
   - Features: Post feed, chat with 5-second polling, auth-gated posting
   - File: `redesign/pages/PublicPortal.tsx`

3. **Citizen Route Trap:**
   - Line 180 of `CitizenApp.tsx`:
     ```typescript
     if (path.startsWith('/citizen/community')) return <CitizenUnavailablePage go={go} title="Community discussions unavailable" />;
     ```
   - This route handler **exists** and **intercepts** any `/citizen/community*` navigation
   - It returns an "unavailable" stub page instead of rendering community features

#### What's Missing

1. **No navigation link** from Citizen interface to `/community` or any community feature:
   - `CitizenShell` navigation (lines 103-112 of `CitizenApp.tsx`) includes:
     - Home, Fire Map, Report, My Reports, Stay safe
   - **No Community or Chat link**

2. **No integration** of `CommunityPage` component into Citizen router:
   - Citizen router only handles `/citizen/*` paths
   - Community lives at `/community` (top-level, not under `/citizen/*`)

3. **No cross-linking:**
   - Community page (`/community`) has no Citizen-specific navigation
   - Citizen home page has no link to Community

### Root Cause

**Architectural mismatch:**
- Community features were implemented as a **top-level public route** (`/community`)
- Citizen features were implemented as a **scoped sub-app** (`/citizen/*`)
- **No navigation bridge** was built between them

**Possible original intent:**
- The route trap at line 180 of `CitizenApp.tsx` suggests an intent to embed community features under `/citizen/community`
- This was never implemented
- The stub page was left as a placeholder

### Why It Was Missed

1. **Separate feature development:** Community and Citizen were likely built by different workstreams
2. **No integration test:** No E2E test verifying "Citizen can access community discussions"
3. **No nav audit:** Navigation completeness was not verified against landing page promises

### Impact

- **P0 Severity:** User-facing promise on landing page is broken
- **Scope:** Affects all Citizen users
- **Discoverability:** Users cannot find community features from Citizen interface
- **Workaround:** Authenticated citizens can manually navigate to `/community`, but this is not discoverable

---

## E. API Call Inventory

### Backend API Endpoints Used

#### Authentication
- `POST /api/auth/redesign/login` — staff login (`Login.tsx`, `api.ts`)
- `POST /api/auth/citizen/login` — citizen login (`CitizenAuthPage.tsx`)
- `POST /api/auth/citizen/register` — citizen registration (`CitizenAuthPage.tsx`)
- `POST /api/auth/logout` — logout (`api.ts`)
- `POST /api/auth/access-requests` — access request form (`RequestAccessPage.tsx`)
- `POST /api/auth/password-reset/request` — password reset (`AuthPage.tsx`)

#### Incidents (Legacy)
- `GET /api/incidents` — list incidents (`IncidentsListPage.tsx`, `ControlRoomApp.tsx`)
- `POST /api/incidents` — create incident (`IncidentsPage.tsx`, offline queue sync)
- `GET /api/incidents/{id}` — incident detail (`ControlRoomApp.tsx`)
- `PATCH /api/incidents/{id}/status` — update status (`IncidentsListPage.tsx`, `ControlRoomApp.tsx`)
- `POST /api/incidents/{id}/images` — upload image (`IncidentsPage.tsx`, `api.ts`)
- `GET /api/incidents/{id}/images/{imageId}` — fetch image (`api.ts`)
- `POST /api/incidents/{id}/images/{imageId}/review` — submit human review (`IncidentsListPage.tsx`)
- `GET /api/incidents/{id}/history` — audit history (`ControlRoomApp.tsx`)

#### Citizen Reporting
- `POST /api/citizen/reports` — create report (`CitizenApp.tsx`)
- `GET /api/citizen/reports` — list user's reports (`CitizenApp.tsx`)
- `GET /api/citizen/reports/{id}` — report detail (`CitizenApp.tsx`)
- `POST /api/citizen/reports/{id}/evidence` — upload evidence (`CitizenApp.tsx`)

#### Ranger Field Operations
- `GET /api/ranger/assignments` — list assignments (`RangerApp.tsx`)
- `POST /api/ranger/assignments/{id}/decision` — accept/decline task (`RangerApp.tsx`)
- `POST /api/ranger/assignments/{id}/verification` — submit verification (`RangerApp.tsx`)
- `POST /api/ranger/assignments/{id}/evidence` — upload evidence (`RangerApp.tsx`)

#### Control Room
- `GET /api/control-room/incidents/{id}/assignments` — list assignments (`ControlRoomApp.tsx`)
- `POST /api/control-room/incidents/{id}/assignments` — assign ranger (`ControlRoomApp.tsx`)
- `GET /api/control-room/rangers` — list rangers (`ControlRoomApp.tsx`)

#### Community
- `GET /api/community/posts` — list posts (`PublicPortal.tsx`)
- `POST /api/community/posts` — create post (`PublicPortal.tsx`)
- `GET /api/community/chat` — fetch chat messages (`PublicPortal.tsx`)
- `POST /api/community/chat` — send message (`PublicPortal.tsx`)
- `GET /api/community/posts?archived=true` — archived posts (`PublicPortal.tsx`)

#### Risk/Map Data
- `GET /api/risk/daily?target={date}` — daily risk data (`MapPage.tsx`, `BriefPage.tsx`)
- `GET /api/risk/geojson?target={date}&state={state}` — risk GeoJSON (`TodayPage.tsx`)

#### Field Queue (Experimental)
- `GET /api/field/queue` — field task queue (`FieldPage.tsx`)
- `POST /api/field/reports` — submit field report (`FieldPage.tsx`)

### API Client Implementations

**Two separate API clients exist:**

1. **Legacy API Client** (`lib/api.ts`):
   - Function: `api<T>(path, options)`
   - Error handling: `ApiError` class with status codes
   - Auth: Bearer token from `localStorage.getItem('resq_token')`
   - CSRF: Uses `addCsrfHeader()` helper
   - Used by: Legacy staff routes (`/app/*`)

2. **Redesign API Client** (`redesign/lib/api.ts`):
   - Function: `rqFetch<T>(path, options)`
   - Error handling: Throws `Error` with user-friendly messages
   - Auth: Bearer token via `getAuthToken()` helper
   - CSRF: Uses `addCsrfHeader()` helper
   - Token expiry: Calls `clearExpiredToken()` on 401
   - Used by: Redesign routes (`/citizen/*`, `/ranger/*`, `/control-room/*`)

**Inconsistency:** Two API clients with different error handling patterns. Both use same token storage and CSRF mechanism.

### Offline Queue

**Implementation:** `lib/offlineQueue.ts`

**Used by:** Legacy incident creation (`IncidentsPage.tsx`)

**Mechanism:**
- On network failure (TypeError), queue incident to localStorage
- On reconnect, sync queued incidents via `api('/api/incidents', { method: 'POST', ... })`
- Sync triggered by online event + initial load (lines 70-76 of `App.tsx`)

**Status:** ✓ Works for legacy incident creation only

---

## F. Prioritized Defect List

### P0 — Critical User-Facing Issues

| # | Defect | Affected Files | Root Cause | Impact |
|---|--------|---------------|------------|--------|
| P0-1 | **Citizen cannot access Community/Chat** | `redesign/pages/CitizenApp.tsx` line 180, `CitizenShell` navigation | No navigation link to `/community`; route trap at `/citizen/community*` returns "unavailable" stub | User-facing promise on landing page is broken; Citizen users cannot discover community features |
| P0-2 | **Missing state validation** allows invalid incident creation | `features/operations/IncidentsPage.tsx` line 40 | Validation error set in state but form still submits if user bypasses UI | Invalid data can be sent to backend if state is empty |

### P1 — Functional Gaps

| # | Defect | Affected Files | Root Cause | Impact |
|---|--------|---------------|------------|--------|
| P1-1 | **Offline queue only works for legacy incidents** | `lib/offlineQueue.ts`, `IncidentsPage.tsx` | Redesign routes use different API client; no offline queue integration | Citizen/Ranger reports fail silently when offline instead of queueing |
| P1-2 | **Citizen fire map is a placeholder** | `redesign/pages/CitizenApp.tsx` lines 91-96 | No public incident feed connected | Promised feature not implemented |
| P1-3 | **Ranger report history unavailable** | `redesign/pages/RangerApp.tsx` line 95 | Backend does not expose Ranger-owned report history endpoint | Rangers cannot see confirmed submissions after session ends |
| P1-4 | **Two separate API clients with inconsistent error handling** | `lib/api.ts`, `redesign/lib/api.ts` | Parallel development of legacy and redesign | Error messages and retry behavior differ between legacy and redesign routes |
| P1-5 | **Assistant page is a stub** | `features/operations/AssistantPage.tsx` | No AI assistant backend connected | Promised feature in navigation shows "not connected" message |
| P1-6 | **No live risk/map data indicated** | `pages/MapPage.tsx`, `redesign/pages/TodayPage.tsx` | Both use saved fallbacks; banners say "sample data" | Users may expect live data; unclear if this is temporary or permanent |

### P2 — UX Inconsistencies

| # | Defect | Affected Files | Root Cause | Impact |
|---|--------|---------------|------------|--------|
| P2-1 | **Duplicate incident workflows** | `features/operations/IncidentsListPage.tsx`, `redesign/pages/ControlRoomApp.tsx` | Two parallel implementations | Maintenance burden; potential for divergence |
| P2-2 | **Inconsistent navigation patterns** | All navigation shells | Legacy uses sidebar + bottom tabs; redesign uses headers + mobile tabs | User confusion when switching between legacy and redesign |
| P2-3 | **Inconsistent status labels** | `IncidentsListPage.tsx` line 55, `ControlRoomApp.tsx` line 20 | Duplicate `STATUS_LABELS` constants | Risk of label mismatch between views |
| P2-4 | **Community chat polls every 5 seconds** | `redesign/pages/PublicPortal.tsx` line 104 | No WebSocket or SSE implementation | High polling frequency may strain server |
| P2-5 | **Redesign routes use "saved examples" banner even for operational routes** | `redesign/RedesignRoot.tsx` line 57 | Banner text does not distinguish demo from operational | Users may think operational features are demos |
| P2-6 | **Mobile navigation truncates to 5 items in legacy** | `app/App.tsx` line 152 | Bottom tabs slice first 5 pages | Plan, Admin pages unreachable on mobile legacy UI |

### P3 — Technical Debt

| # | Defect | Affected Files | Root Cause | Impact |
|---|--------|---------------|------------|--------|
| P3-1 | **Placeholder pages for Settings, Alerts, Plan, Spread** | `pages/InteractivePages.tsx`, feature files | Features not implemented | Navigation links exist but pages are incomplete |
| P3-2 | **Hard-coded placeholder emails in forms** | `components/Login.tsx` line 91 | Development placeholder | Minor UX issue |
| P3-3 | **No loading states for some API calls** | Various | Incomplete async state handling | Users see blank screens during fetch |
| P3-4 | **Assessment presentation logic duplicated** | `lib/assessmentPresentation.ts` used by both legacy and redesign | Shared logic but no clear ownership | Risk of divergence if updated in one place |
| P3-5 | **No E2E tests visible** | Project structure | Testing not audited | Cannot verify workflows end-to-end |
| P3-6 | **Field Page API may be demo-only** | `redesign/pages/FieldPage.tsx` | Unclear if `/api/field/*` is operational or example | Ambiguous operational status |

---

## G. Additional Findings

### Security Observations

1. **CSRF Protection:** Implemented via `addCsrfHeader()` helper, reads `resq_csrf` cookie
2. **Auth Tokens:** Stored in `localStorage` as `resq_token`
3. **Role-Based Access:** Enforced in frontend routing (lines 138-145 of `App.tsx`, lines 39-46 of `RedesignRoot.tsx`)
   - **Note:** Frontend guards are UX only; backend authorization is authoritative (as stated in code comments)
4. **Image Upload:** Uses FormData, respects CSRF and Bearer token headers
5. **Citizen Auth:** Separate endpoint from staff auth, uses same token storage mechanism

### Performance Notes

1. **Community chat polling:** 5-second interval may be excessive (line 104 of `PublicPortal.tsx`)
2. **Risk data caching:** No visible cache strategy; fetches on every mount
3. **Image assessment:** Assessment results returned inline with upload response (good UX)
4. **Offline queue:** localStorage-based, syncs on reconnect (lines 70-76 of `App.tsx`)

### Accessibility

- **Semantic HTML:** Generally good use of `<nav>`, `<main>`, `<section>`, `<article>`
- **ARIA labels:** Present on key interactions (e.g., "Search pages and places")
- **Role attributes:** `role="status"`, `role="alert"` used appropriately
- **Keyboard navigation:** Command palette (⌘K) implemented
- **Screen reader support:** `<span className="sr-only">` used for icon labels

### Styling Architecture

- **Legacy:** CSS classes in `styles.css`, `ui.css`
- **Redesign:** Tailwind-style utility classes (`data-rq-app`, inline styles)
- **Inconsistency:** Two separate styling systems

### State Management

- **Legacy:** useState hooks, no global state visible
- **Redesign:** React Query (`@tanstack/react-query`) for server state in Ranger and Control Room
- **Inconsistency:** Legacy routes use raw `useEffect` + `fetch`; redesign uses React Query

---

## H. Summary of Working Features

### Fully Functional (Verified)

1. ✓ **Citizen incident reporting** — 4-step wizard with map picker, image upload, server persistence
2. ✓ **Citizen report history** — Lists user's reports with status and evidence assessment
3. ✓ **Legacy incident triage** — Full workflow: list, status transitions, human review, image assessment display
4. ✓ **Control Room incident management** — Full workflow: queue, detail, status transitions, ranger assignment, verification history, audit log
5. ✓ **Ranger field operations** — Assignment management, decision workflow, verification submission, evidence upload
6. ✓ **Community discussion** — Public posts, authenticated chat, polling updates
7. ✓ **Staff authentication** — Login with workspace routing
8. ✓ **Citizen authentication** — Separate login/register with returnTo redirect
9. ✓ **Offline incident queue** — Legacy incidents queue locally and sync on reconnect
10. ✓ **Image assessment display** — Uses `presentAssessment()` helper, shows experimental outputs in staff views

### Partially Functional (Placeholders/Limitations)

1. ⚠️ **Map/Risk displays** — Use saved historical data with clear banners
2. ⚠️ **Citizen fire map** — Placeholder with "no source connected" message
3. ⚠️ **Ranger report history** — Local session only; no backend persistence endpoint
4. ⚠️ **Field Page** — May be demo-only; operational status unclear
5. ⚠️ **Brief page** — Weather and incident sections show "unavailable"

### Not Functional (Stubs)

1. ✗ **Community access from Citizen** — Route exists but shows "unavailable"
2. ✗ **AI Assistant** — Shows "not connected" message
3. ✗ **Settings, Alerts, Alert Rules, Plan, Spread pages** — Placeholders

---

## I. Recommendations (Out of Scope)

*This is an audit only. Recommendations for fixes are deferred to remediation phase.*

---

## Appendix: File Structure Summary

```
frontend/src/
├── app/
│   ├── App.tsx                    # Main router, workspace routing, offline queue sync
│   ├── config.ts                  # API base, navigation definitions, route metadata
│   ├── types.ts                   # Shared type definitions
│   └── workspaceRouting.ts        # Role-based workspace entry logic
├── components/
│   ├── Brand.tsx                  # Logo component
│   ├── CommandPalette.tsx         # ⌘K search
│   ├── Login.tsx                  # Staff login form
│   ├── RouteErrorBoundary.tsx     # Error boundary wrapper
│   └── [other UI components]
├── features/
│   └── operations/
│       ├── AdminPage.tsx          # Admin dashboard
│       ├── IncidentsListPage.tsx  # Legacy incident triage (COMPLETE)
│       ├── IncidentsPage.tsx      # Legacy incident creation (COMPLETE)
│       ├── PlanListPage.tsx       # Patrol plans
│       ├── ReportsPage.tsx        # Reports dashboard
│       ├── AssistantPage.tsx      # AI assistant (STUB)
│       └── [other feature pages]
├── lib/
│   ├── api.ts                     # Legacy API client (ApiError class)
│   ├── assessmentPresentation.ts  # Fire evidence assessment display helper
│   ├── offlineQueue.ts            # Offline incident queue
│   └── session.ts                 # Session management
├── pages/
│   ├── AuthPage.tsx               # Password reset flow
│   ├── BriefPage.tsx              # Daily briefing
│   ├── ForbiddenPage.tsx          # 403 error
│   ├── InteractivePages.tsx       # Router for feature pages
│   ├── MapPage.tsx                # Legacy map view
│   ├── OperationsPage.tsx         # Generic operations template
│   ├── PublicPage.tsx             # Generic public page template
│   ├── RequestAccessPage.tsx      # Access request form
│   ├── ShellPage.tsx              # Generic page shell
│   └── SystemPage.tsx             # Error pages (404, 500, etc.)
├── redesign/
│   ├── RedesignRoot.tsx           # Redesign router + saved examples nav
│   ├── components/
│   │   ├── map.tsx                # Map component with react-map-gl
│   │   ├── primitives.tsx         # UI primitives
│   │   └── [other redesign components]
│   ├── lib/
│   │   ├── api.ts                 # Redesign API client (rqFetch)
│   │   ├── citizenAuth.ts         # Citizen auth helpers
│   │   ├── fieldQueue.ts          # Field queue local storage
│   │   ├── routes.ts              # Role-based route guards
│   │   ├── sessionAuth.ts         # Session auth helpers (CSRF, token expiry)
│   │   └── types.ts               # Redesign type definitions
│   ├── pages/
│   │   ├── CitizenApp.tsx         # Citizen router + all citizen pages (MOSTLY COMPLETE, COMMUNITY BROKEN)
│   │   ├── CitizenAuthPage.tsx    # Citizen login/register (COMPLETE)
│   │   ├── ControlRoomApp.tsx     # Control Room router + pages (COMPLETE)
│   │   ├── FieldPage.tsx          # Field queue page (PARTIAL)
│   │   ├── IncidentPage.tsx       # Saved incident detail + spread sim
│   │   ├── LandingPage.tsx        # Redesign landing (saved data)
│   │   ├── OfflineDemoPage.tsx    # Offline demo display
│   │   ├── PublicPortal.tsx       # Public landing, community, archive (COMPLETE)
│   │   ├── RangerApp.tsx          # Ranger router + all ranger pages (COMPLETE)
│   │   ├── SimulationLabPage.tsx  # Saved simulation display
│   │   ├── TodayPage.tsx          # Today risk ranking (saved/fallback)
│   │   └── WatchPage.tsx          # Historical reports
│   └── styles/
│       └── index.css              # Redesign styles (Tailwind-based)
├── main.tsx                       # App entry point
├── styles.css                     # Legacy styles
└── ui.css                         # Legacy UI styles
```

**Total:** 73 source files analyzed

---

**END OF AUDIT REPORT**
