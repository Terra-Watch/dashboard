# TerraWatch Master Remediation Plan

**Generated:** October 2024  
**Based On:** Consolidated findings from frontend, backend, and database audits  
**Repository:** `/Users/kireeti/Desktop/Projects/RESQ/website`  
**Branch:** main @ b151a593

---

## Executive Summary

The TerraWatch application is **substantially complete** with working core workflows for citizen reporting, control room operations, ranger field work, and community discussion. However, **one critical integration gap** prevents citizens from accessing promised community features, and several medium-priority defects affect data visibility and UX consistency.

**Overall Status:**
- ✅ Core incident reporting and triage workflows: **WORKING**
- ✅ AI Fire Evidence Assessor integration: **WORKING** (preserve as-is)
- ✅ Ranger field verification: **WORKING**
- ✅ Control room operations: **WORKING**
- ✅ Community discussion platform: **WORKING**
- ❌ Citizen→Community integration: **BROKEN** (P0)
- ⚠️ Notification delivery to citizens: **INCOMPLETE** (P1)
- ⚠️ Schema discoverability: **POOR** (P2)

**Key Metrics:**
- **P0 Critical Defects:** 1 (Citizen community access)
- **P1 High-Priority Defects:** 5 (missing endpoints, notification gaps, offline queue limitations)
- **P2 Medium-Priority Issues:** 9 (UX inconsistencies, duplicated implementations, missing features)
- **P3 Low-Priority Enhancements:** 15+ (technical debt, polish, documentation)

---

## 1. Four User Experience States

### 1.1 COMMUNITY Experience

**Intended Purpose:** Public community participation, discussion, preparedness, and information sharing.

**Current State:** ✅ **FULLY IMPLEMENTED**

**What Exists:**
- Public landing at `/community` with discussion board and real-time chat
- Backend: `/api/community/posts`, `/api/community/chat`, `/api/community/posts/{id}/comments`
- Rate limiting: 10 posts/10min, 10 comments/10min, 20 chat messages/10min
- Moderation: Archive/report functionality for control_room_operator+
- Authentication: Optional for viewing, required for posting (PUBLIC_ROLES)
- Frontend: Complete `CommunityPage` component with polling-based updates (5s interval)

**What Works:**
- ✅ Post creation and display with pagination
- ✅ Comment threads on posts
- ✅ Real-time chat (polling-based, labeled as `delivery: 'polling'`)
- ✅ Content moderation reports
- ✅ Archive workflow for staff

**Known Issues:**
- ⚠️ Chat uses polling instead of WebSocket/SSE (P3 enhancement)
- ⚠️ Community actions not written to audit log (P3)
- ⚠️ No official announcements table (P3)

**Verdict:** Community experience is production-ready as a standalone feature. The critical issue is that **Citizen users cannot discover it**.

---

### 1.2 CITIZEN Experience

**Intended Purpose:** Allow citizens to report incidents, submit evidence, participate in community, and follow their reports.

**Current State:** ⚠️ **PARTIALLY WORKING** (missing community integration)

**What Exists:**
- Citizen portal at `/citizen/*` with dashboard, reporting wizard, report history, safety guidance
- Backend: `/api/citizen/reports`, `/api/citizen/reports/{id}/evidence`
- Authentication: Separate citizen registration and login at `/citizen/register`, `/citizen/login`
- Frontend: Complete `CitizenApp.tsx` with mobile-responsive navigation

**What Works:**
- ✅ Citizen registration and authentication
- ✅ 4-step incident reporting wizard with map picker, description, and state selection
- ✅ Image evidence upload with AI assessment trigger
- ✅ "My Reports" list showing status and evidence
- ✅ Report detail view with evidence thumbnails and assessment status
- ✅ Safety guidance page with preparedness resources
- ✅ Idempotent report creation (client_key deduplication)

**What's Broken:**
- ❌ **P0: No navigation to Community features** — Route `/citizen/community*` exists but shows "unavailable" stub
- ❌ **P1: Citizens cannot VIEW uploaded evidence images** — No `/api/citizen/reports/{id}/evidence/{image_id}` endpoint
- ❌ **P1: Citizens do not see status change notifications** — Alerts generated on backend but CitizenApp doesn't poll `/api/alerts`
- ⚠️ **P1: Citizen fire map is placeholder** — Shows "No public map source connected" message
- ⚠️ **P1: Offline queue only works for legacy staff routes** — Citizen reports fail when offline instead of queuing

**Missing Features:**
- Community/Chat access (promised on landing page but not linked)
- Notification center (alerts exist on backend, not displayed)
- Public fire map (marked as placeholder)

**Root Cause Analysis: Citizen→Community Access Gap**

**The Problem:**  
Landing page promises: *"Report fires and access public fire information, community discussions, reporting, and safety guidance."*

Reality: Zero navigation to community features from Citizen interface.

**Code Evidence:**

1. **Route trap exists:**  
   File: `frontend/src/redesign/pages/CitizenApp.tsx` line 180
   ```typescript
   if (path.startsWith('/citizen/community')) return <CitizenUnavailablePage go={go} title="Community discussions unavailable" />;
   ```
   This intercepts `/citizen/community*` and shows stub page instead of integrating community.

2. **No navigation link:**  
   File: `frontend/src/redesign/pages/CitizenApp.tsx` lines 103-112 (`CitizenShell` component)
   ```typescript
   // Navigation includes: Home, Fire Map, Report, My Reports, Stay safe
   // NO Community or Chat link
   ```

3. **Community exists at top level:**  
   File: `frontend/src/redesign/pages/PublicPortal.tsx`
   - Route: `/community` (NOT `/citizen/community`)
   - Component: `CommunityPage` with full discussion board and chat
   - Accessible by ALL authenticated users including citizens

**Root Cause:** Community was implemented as top-level public route (`/community`). Citizen was implemented as scoped sub-app (`/citizen/*`). No navigation bridge built between them. Route trap at line 180 suggests original intent to embed community under `/citizen/community` but was never completed.

**Impact:** P0 severity. User-facing promise on landing page broken. All Citizen users affected.

**Verdict:** Citizen experience is 80% complete. Requires community integration, notification display, and evidence image retrieval to be production-ready.

---

### 1.3 RANGER / RANGE OFFICER Experience

**Intended Purpose:** Field crew receives assignments, performs field verification, uploads evidence, and reports outcomes.

**Current State:** ✅ **FULLY WORKING**

**What Exists:**
- Ranger portal at `/ranger/*` with assignments dashboard, incident detail, verification wizard, evidence upload
- Backend: `/api/ranger/assignments`, `/api/ranger/assignments/{id}/decision`, `/api/ranger/assignments/{id}/verification`, `/api/ranger/assignments/{id}/evidence`
- Authentication: Uses staff authentication with role='field_crew'
- Frontend: Complete `RangerApp.tsx` with mobile-first design

**What Works:**
- ✅ Assignment list with status filtering (assigned, accepted, in_progress, completed)
- ✅ Assignment detail with incident context and actions
- ✅ Accept/decline/start workflow (state machine enforced on backend)
- ✅ 3-step verification wizard: outcome selection, field notes, evidence upload
- ✅ Evidence upload with AI assessment feedback
- ✅ Offline draft support (localStorage queue with session confirmations)
- ✅ Due date and priority display
- ✅ Alerts generated to control room on verification submission

**Known Issues:**
- ⚠️ **P1: Ranger report history unavailable** — Backend has no endpoint to retrieve completed verifications; only local drafts visible
- ⚠️ **P1: Offline queue only works for legacy routes** — Ranger verifications fail when offline instead of queuing

**Verdict:** Ranger experience is production-ready for assigned field work. Missing report history is a visibility gap but doesn't block operational workflow.

---

### 1.4 CONTROL ROOM Experience

**Intended Purpose:** Control room operators and incident commanders triage incidents, assign rangers, review evidence, update status, and monitor operations.

**Current State:** ✅ **FULLY WORKING**

**What Exists:**
- Control room portal at `/control-room/*` with operational overview, incident queue, incident detail with full workflow
- Backend: `/api/incidents`, `/api/control-room/incidents/{id}/assignments`, `/api/control-room/rangers`, incident status updates
- Authentication: Roles: control_room_operator, incident_commander, admin
- Frontend: Complete `ControlRoomApp.tsx` with desktop-optimized layout

**What Works:**
- ✅ Operational overview with metrics (active incidents, pending assignments, recent activity)
- ✅ Incident queue with search and status filters
- ✅ Incident detail page with:
  - Full incident metadata (source, state, location, observed time)
  - Evidence gallery with AI assessment display (uses `presentAssessment()` helper)
  - Human review submission (VERIFIED_AUTHENTIC, POTENTIALLY_SYNTHETIC, REVIEWED)
  - Status transitions with validation (reported→verified→responding→contained→closed)
  - Ranger assignment creation (select ranger, priority, due date)
  - Assignment history (created, accepted, completed)
  - Field verification display (outcome, notes, observed time)
  - Complete audit log/history timeline
- ✅ State-scoped access control (operators see only their home_state incidents unless admin)
- ✅ Alert generation on incident creation, status changes, assignments, verifications

**Known Issues:**
- ⚠️ **P2: Duplicate incident workflow** — Legacy `/app/incidents` provides similar functionality; maintenance burden

**Verdict:** Control room experience is production-ready and comprehensive. Best-implemented of the four experiences.

---

## 2. Cross-Referenced Defect Register

This section merges all P0/P1/P2/P3 findings from frontend, backend, and database audits into one prioritized list with explicit cross-references where frontend issues have backend root causes.

### Priority 0: Critical (Breaks User Expectations)

#### P0-1: Citizen Cannot Access Community Features

**Title:** Citizen users cannot access community discussions promised on landing page

**Severity:** CRITICAL — User-facing promise broken

**Affected Components:**
- Frontend: `frontend/src/redesign/pages/CitizenApp.tsx` lines 103-112 (navigation), line 180 (route trap)
- Backend: N/A (community APIs work correctly)
- Database: N/A

**Root Cause:**  
Architectural mismatch. Community implemented at top-level route `/community`. Citizen implemented as sub-app `/citizen/*`. No navigation bridge built. Route trap at line 180 shows intent to embed community under `/citizen/community` but never completed.

**What Needs to Change:**
1. Add navigation link in `CitizenShell` component (line 103-112) to `/community`
2. Remove route trap at line 180 that intercepts `/citizen/community*`
3. Ensure authenticated citizens can access `/community` (already works, just needs link)
4. Optionally: Add "Community" to mobile bottom tabs

**Files to Touch:**
- `frontend/src/redesign/pages/CitizenApp.tsx` (navigation and routing)

**What to Preserve:**
- Existing `/community` route and `CommunityPage` component (fully functional)
- Community backend APIs (working correctly)
- PUBLIC_ROLES authorization (citizens already allowed)

**Verification:**
- Navigate to `/citizen` as authenticated citizen
- Click "Community" link in header/navigation
- Verify `/community` page loads with discussion board and chat
- Verify citizen can create posts and send chat messages
- Verify navigation back to `/citizen` works

---

### Priority 1: High-Priority Functional Gaps

#### P1-1: Citizens Cannot View Their Uploaded Evidence Images

**Title:** Missing endpoint to retrieve citizen-uploaded evidence images

**Severity:** HIGH — Feature 50% complete (can upload but not view)

**Affected Components:**
- Frontend: `frontend/src/redesign/pages/CitizenApp.tsx` `CitizenReportDetailPage` (displays evidence metadata but cannot show images)
- Backend: `backend/app/routers/citizen.py` (missing `GET /api/citizen/reports/{report_id}/evidence/{image_id}`)
- Database: Images stored at `runtime_data/incident_images/{incident_id}/{sha256}.{ext}` but no retrieval path

**Root Cause:**  
Evidence upload endpoint implemented (`POST /api/citizen/reports/{report_id}/evidence`) but retrieval endpoint never added. Citizens see evidence list with filenames and assessment_status but cannot view the actual images.

**Cross-Reference:**
- Backend audit P1 Defect #1: "Missing Citizen Evidence Retrieval Endpoint"
- Database audit: Flow 2 verified images are stored correctly, retrieval path missing

**What Needs to Change:**
1. Add backend endpoint: `GET /api/citizen/reports/{report_id}/evidence/{image_id}`
   - Authorization: Verify reporter_id matches current user
   - Query: `SELECT storage_key, content_type FROM resq_incident_images WHERE id=:image_id AND incident_id IN (SELECT id FROM resq_incidents WHERE reporter_id=:user_id)`
   - Read file from `IMAGE_ROOT/{storage_key}`
   - Return binary with appropriate Content-Type and cache headers
   - Pattern: Similar to existing `GET /api/incidents/{incident_id}/images/{image_id}` (line ~380 of operations.py)

2. Update frontend to display images:
   - Modify `CitizenReportDetailPage` to render `<img>` tags with authenticated fetch
   - Pattern: Similar to incident image display in `IncidentsListPage.tsx`

**Files to Touch:**
- `backend/app/routers/citizen.py` (add new endpoint)
- `frontend/src/redesign/pages/CitizenApp.tsx` (update CitizenReportDetailPage)

**What to Preserve:**
- Existing evidence upload flow (working correctly)
- AI assessment trigger (working correctly)
- Image storage structure (working correctly)

**Verification:**
- As authenticated citizen, navigate to `/citizen/reports/{id}`
- Verify evidence images display as thumbnails
- Click image to view full size
- Verify only reporter can view their own evidence (403 for other users)
- Verify assessment status displayed alongside image

---

#### P1-2: Citizens Do Not See Status Change Notifications

**Title:** Alerts generated for incident status changes but not displayed in Citizen UI

**Severity:** HIGH — Notifications sent but not received

**Affected Components:**
- Frontend: `frontend/src/redesign/pages/CitizenApp.tsx` (no alert polling or display)
- Backend: `backend/app/services/alert_service.py` (generates alerts correctly)
- Database: `resq_alerts` table populated correctly (verified in Flow 6)

**Root Cause:**  
Backend generates alerts when control room updates incident status (line ~520 of operations.py: `generate_alert(kind='incident_status_changed', user_id=reporter_id, ...)`). Frontend CitizenApp has no mechanism to poll or display these alerts.

**Cross-Reference:**
- Database audit Finding: "Notification visibility in Citizen UI" (HIGH priority)
- Database audit Flow 7: Alert generated in Flow 6 but CitizenApp doesn't poll `/api/alerts`

**What Needs to Change:**
1. Add alert polling to CitizenApp:
   - Poll `GET /api/alerts` endpoint (already exists, returns alerts for current user)
   - Show unread count badge in header navigation
   - Add notification dropdown or page at `/citizen/notifications`
   - Mark alerts as read via `PATCH /api/alerts/{alert_id}/read` (already exists)

2. Display notification types:
   - `incident_status_changed`: "Your report #{id} status changed to {status}"
   - `verification_submitted`: "A ranger has verified your report #{id}"
   - Other alert kinds as appropriate

**Files to Touch:**
- `frontend/src/redesign/pages/CitizenApp.tsx` (add polling hook, notification badge, notification page)
- Optionally: Create new component `CitizenNotificationsPage`

**What to Preserve:**
- Existing alert generation in backend (working correctly)
- Alert deduplication logic (working correctly)
- Alert status lifecycle (generated→acknowledged→resolved)

**Verification:**
- As control room operator, update incident status for citizen-reported incident
- As citizen (report owner), navigate to `/citizen`
- Verify notification badge appears with unread count
- Click notifications, verify alert message displayed
- Click "mark read", verify count decrements
- Verify only citizen's own alerts visible (not all alerts)

---

#### P1-3: Offline Queue Only Works for Legacy Staff Routes

**Title:** Redesign routes (Citizen, Ranger) fail when offline instead of queuing

**Severity:** HIGH — Feature gap for field operations

**Affected Components:**
- Frontend: `frontend/src/lib/offlineQueue.ts` (only used by legacy `IncidentsPage.tsx`)
- Frontend: `frontend/src/redesign/lib/api.ts` (redesign API client has no offline queue)
- Backend: N/A (backend works correctly when requests arrive)

**Root Cause:**  
Offline queue implemented for legacy incident creation (`lib/offlineQueue.ts`) but redesign routes use separate API client (`redesign/lib/api.ts`) with no offline queue integration.

**Cross-Reference:**
- Frontend audit P1-1: "Offline queue only works for legacy incidents"

**What Needs to Change:**
1. Integrate offline queue into redesign API client:
   - Modify `redesign/lib/api.ts::rqFetch()` to detect network errors (TypeError, fetch failure)
   - Queue failed POST requests to localStorage with request details
   - Sync queued requests on reconnect (online event + initial load)
   - Pattern: Extend `lib/offlineQueue.ts` to support generic requests, not just incidents

2. Apply to critical citizen/ranger actions:
   - Citizen report creation: `POST /api/citizen/reports`
   - Citizen evidence upload: `POST /api/citizen/reports/{id}/evidence`
   - Ranger verification: `POST /api/ranger/assignments/{id}/verification`
   - Ranger evidence upload: `POST /api/ranger/assignments/{id}/evidence`

**Files to Touch:**
- `frontend/src/lib/offlineQueue.ts` (generalize to support any POST request)
- `frontend/src/redesign/lib/api.ts` (integrate offline queue for network errors)
- `frontend/src/redesign/pages/CitizenApp.tsx` (sync queue on mount)
- `frontend/src/redesign/pages/RangerApp.tsx` (sync queue on mount)

**What to Preserve:**
- Existing legacy offline queue (working correctly for `/app/incidents/new`)
- Idempotency keys (client_key, idempotency_key) prevent duplicates on sync

**Verification:**
- As citizen, disconnect from network (airplane mode)
- Submit incident report
- Verify queued locally (localStorage inspection)
- Reconnect to network
- Verify report syncs automatically and appears in "My Reports"
- Verify duplicate not created (idempotency key works)

---

#### P1-4: Citizen Fire Map is Placeholder

**Title:** Citizen map page shows "No public map source connected"

**Severity:** HIGH — Promised feature not implemented

**Affected Components:**
- Frontend: `frontend/src/redesign/pages/CitizenApp.tsx` lines 91-96 (`CitizenMapPage`)
- Backend: No dedicated public incident feed endpoint

**Root Cause:**  
Frontend has route and page but no data source connected. Backend has incident data but no public incident feed endpoint (GET /api/incidents requires authentication and staff roles).

**What Needs to Change:**
1. Decide on public map data source:
   - Option A: Create public incident feed endpoint (e.g., `GET /api/public/incidents?state={state}`) with sanitized data (no reporter names, no operational notes)
   - Option B: Use existing `/api/risk/geojson` risk layer as base + public incidents overlay
   - Option C: Mark as "Coming Soon" if public incident display has policy/privacy concerns

2. If implementing public feed:
   - Add backend endpoint with PUBLIC_ROLES authorization (allow unauthenticated for read-only)
   - Return only safe fields: id, state, latitude, longitude, status (if status not 'reported'), size, observed_at
   - Exclude: reporter_id, notes, evidence, operational metadata
   - Filter: Only show incidents in certain statuses (e.g., verified, responding, contained — exclude 'reported' for privacy)

3. Update frontend to fetch and display:
   - Modify `CitizenMapPage` to fetch public incidents
   - Display as map markers with status-based styling
   - Pattern: Similar to redesign map components in `redesign/components/map.tsx`

**Files to Touch:**
- `backend/app/routers/operations.py` or create new `backend/app/routers/public.py`
- `frontend/src/redesign/pages/CitizenApp.tsx` (CitizenMapPage implementation)

**What to Preserve:**
- Privacy: Do NOT expose reporter identity, personal notes, or unverified reports
- Authorization: Respect state-scoped access where appropriate

**Verification:**
- Navigate to `/citizen/map` as authenticated or unauthenticated user
- Verify map loads with incident markers
- Click marker, verify popup shows safe fields only
- Verify no reporter names or operational notes visible

**Decision Required:** Confirm with stakeholders whether public incident display is desired, and what fields are safe to expose.

---

#### P1-5: Two Separate API Clients with Inconsistent Error Handling

**Title:** Legacy and redesign API clients have different error handling patterns

**Severity:** MEDIUM-HIGH — Inconsistent UX, maintenance burden

**Affected Components:**
- Frontend: `frontend/src/lib/api.ts` (legacy API client, ApiError class)
- Frontend: `frontend/src/redesign/lib/api.ts` (redesign API client, plain Error)

**Root Cause:**  
Parallel development of legacy staff workspace and redesign portal led to two API clients with different error handling, CSRF patterns, and token expiry logic.

**Cross-Reference:**
- Frontend audit P1-4: "Two separate API clients with inconsistent error handling"

**What Needs to Change:**
1. **Option A (Recommended):** Consolidate to one API client
   - Migrate legacy routes to use `redesign/lib/api.ts::rqFetch()`
   - Retire `lib/api.ts`
   - Unify error handling: Always throw `Error` with user-friendly messages
   - Unify CSRF: Use `addCsrfHeader()` from redesign lib
   - Unify token expiry: Use `clearExpiredToken()` logic

2. **Option B (Interim):** Harmonize error handling without merging
   - Align `lib/api.ts::ApiError` to match `rqFetch()` error messages
   - Ensure both clients use same CSRF helper
   - Ensure both clients handle 401 token expiry identically

**Files to Touch:**
- `frontend/src/lib/api.ts` (deprecate or align with redesign)
- `frontend/src/redesign/lib/api.ts` (expand to support legacy routes)
- All legacy pages: `pages/MapPage.tsx`, `pages/BriefPage.tsx`, `features/operations/IncidentsListPage.tsx`, etc.

**What to Preserve:**
- Token storage mechanism (localStorage `resq_token`)
- CSRF cookie mechanism (both clients already use it)

**Verification:**
- Navigate legacy routes (`/app/map`, `/app/incidents`)
- Verify errors display consistently with redesign routes
- Test 401 token expiry: Verify redirects to login on both legacy and redesign
- Test CSRF failure: Verify error message consistent

**Decision Required:** Choose Option A (consolidate) for long-term health or Option B (harmonize) for minimal disruption.

---

### Priority 2: Medium-Priority UX and Consistency Issues

#### P2-1: Duplicate Incident Triage Implementations

**Title:** Legacy `/app/incidents` and redesign `/control-room/incidents` both provide full triage workflow

**Severity:** MEDIUM — Maintenance burden, potential divergence

**Affected Components:**
- Frontend: `frontend/src/features/operations/IncidentsListPage.tsx` (legacy)
- Frontend: `frontend/src/redesign/pages/ControlRoomApp.tsx` (redesign ControlRoomIncidents)

**Root Cause:**  
Redesign portal built as separate implementation of staff workflows. Legacy routes preserved for backward compatibility. Both now coexist with same functionality but different UX.

**What Needs to Change:**
1. **Option A (Recommended):** Deprecate legacy, redirect to redesign
   - Redirect `/app/incidents` → `/control-room/incidents`
   - Redirect `/app/incidents/{id}` → `/control-room/incidents/{id}`
   - Add banner: "This page has moved. Redirecting to new Control Room interface."
   - Remove legacy code after transition period

2. **Option B:** Keep both, consolidate shared logic
   - Extract `presentAssessment()` and status transition logic to shared module
   - Ensure both use identical backend APIs (already true)
   - Document which interface is canonical

**Files to Touch:**
- `frontend/src/app/App.tsx` (add redirects)
- `frontend/src/features/operations/IncidentsListPage.tsx` (deprecate or remove)
- Optionally: Remove from navigation config `app/config.ts`

**What to Preserve:**
- Backend incident APIs (used by both, working correctly)
- Assessment presentation logic in `lib/assessmentPresentation.ts`

**Verification:**
- Navigate to `/app/incidents`
- Verify redirect to `/control-room/incidents` (if Option A)
- Verify all functionality available in control room interface

**Decision Required:** Choose deprecation timeline and communication to users.

---

#### P2-2: Inconsistent Navigation Patterns Between Legacy and Redesign

**Title:** Legacy uses sidebar + mobile bottom tabs; redesign uses headers + mobile tabs

**Severity:** MEDIUM — User confusion when switching interfaces

**Affected Components:**
- Frontend: `frontend/src/app/App.tsx` (legacy sidebar)
- Frontend: `frontend/src/redesign/pages/*` (redesign headers/shells)

**Root Cause:**  
Two separate design systems for legacy and redesign portals.

**What Needs to Change:**
1. Deprecate legacy interface (see P2-1)
2. If keeping both, add consistent branding/styling to indicate separate interfaces

**Files to Touch:**
- See P2-1

**What to Preserve:**
- Redesign navigation patterns (better mobile UX)

---

#### P2-3: Inconsistent Status Labels

**Title:** Duplicate `STATUS_LABELS` constants in legacy and redesign

**Severity:** MEDIUM — Risk of label mismatch

**Affected Components:**
- Frontend: `frontend/src/features/operations/IncidentsListPage.tsx` line 55
- Frontend: `frontend/src/redesign/pages/ControlRoomApp.tsx` line 20

**Root Cause:**  
Duplicated constant definitions.

**What Needs to Change:**
1. Extract STATUS_LABELS to shared constants file
2. Import from single source in both legacy and redesign

**Files to Touch:**
- Create `frontend/src/lib/constants.ts` or use `app/types.ts`
- `frontend/src/features/operations/IncidentsListPage.tsx` (import)
- `frontend/src/redesign/pages/ControlRoomApp.tsx` (import)

**What to Preserve:**
- Label content (keep existing user-facing strings)

**Verification:**
- Verify status labels identical in legacy and redesign incident lists

---

#### P2-4: Community Chat Polls Every 5 Seconds

**Title:** High polling frequency may strain server

**Severity:** MEDIUM — Performance/scalability concern

**Affected Components:**
- Frontend: `frontend/src/redesign/pages/PublicPortal.tsx` line 104 (useEffect polling interval)
- Backend: `backend/app/routers/community.py` (GET /api/community/chat)

**Root Cause:**  
No WebSocket or Server-Sent Events implementation; polling used as fallback.

**What Needs to Change:**
1. **Short-term:** Increase polling interval from 5s to 10s or 15s
2. **Long-term:** Implement WebSocket endpoint for real-time chat

**Files to Touch:**
- `frontend/src/redesign/pages/PublicPortal.tsx` (change interval)
- Future: `backend/app/routers/community.py` (add WebSocket endpoint)

**What to Preserve:**
- Chat message ordering and display
- Rate limiting on message creation

**Verification:**
- Monitor server load with multiple concurrent chat users
- Verify messages still appear promptly with increased interval

---

#### P2-5: "Saved Examples" Banner on Operational Routes

**Title:** Redesign routes show "saved examples" banner even for operational features

**Severity:** MEDIUM — User confusion

**Affected Components:**
- Frontend: `frontend/src/redesign/RedesignRoot.tsx` line 57

**Root Cause:**  
Banner text does not distinguish demo routes from operational routes.

**What Needs to Change:**
1. Remove banner from operational routes (`/citizen`, `/ranger`, `/control-room`)
2. Keep banner on demo/historical routes (`/redesign`, `/redesign/today`, `/demo`, `/community/archive`)

**Files to Touch:**
- `frontend/src/redesign/RedesignRoot.tsx` (conditional banner display)

**What to Preserve:**
- Banner on actual saved example routes (clear labeling)

**Verification:**
- Navigate to `/citizen`, `/ranger`, `/control-room` — no banner
- Navigate to `/redesign`, `/demo` — banner displayed

---

#### P2-6: Mobile Navigation Truncates to 5 Items in Legacy

**Title:** Bottom tabs on mobile legacy UI only show first 5 pages

**Severity:** MEDIUM — Plan and Admin pages unreachable on mobile

**Affected Components:**
- Frontend: `frontend/src/app/App.tsx` line 152

**Root Cause:**  
Hardcoded slice `.slice(0, 5)` on pages array.

**What Needs to Change:**
1. If deprecating legacy (see P2-1), no change needed
2. If keeping legacy, add overflow menu or horizontal scroll for mobile tabs

**Files to Touch:**
- `frontend/src/app/App.tsx` (mobile bottom tabs logic)

**What to Preserve:**
- Mobile UX for primary pages (Map, Brief, Incidents)

---

#### P2-7: Spread Job Endpoint Returns 503 Placeholder

**Title:** POST /api/spread/jobs returns "unavailable until approved access controls"

**Severity:** MEDIUM — Feature intentionally disabled but may confuse users

**Affected Components:**
- Backend: `backend/app/routers/operations.py` line ~640

**Root Cause:**  
Intentionally disabled per `docs/ingest/RESQ9_AUTH_DECISIONS_FOR_APPROVAL.md` pending authorization integration.

**What Needs to Change:**
1. Review authorization decisions document
2. Implement approved access controls
3. Remove 503 gate and enable endpoint

**Files to Touch:**
- `backend/app/routers/operations.py` (remove 503, implement authorization)
- Review: `docs/ingest/RESQ9_AUTH_DECISIONS_FOR_APPROVAL.md`

**What to Preserve:**
- Security: Do NOT enable without proper authorization

**Decision Required:** Confirm authorization design approved before enabling.

---

#### P2-8: Legacy Login No Audit Log

**Title:** POST /api/auth/login does not record login attempts or write audit log

**Severity:** MEDIUM — Forensic gap

**Affected Components:**
- Backend: `backend/app/routers/auth.py` line 30-39

**Root Cause:**  
Legacy endpoint predates audit log implementation.

**What Needs to Change:**
1. Add login attempt recording (match redesign login pattern)
2. Add audit log write: `audit_log.write_audit_log(action='login_success', ...)`

**Files to Touch:**
- `backend/app/routers/auth.py` (legacy login endpoint)

**What to Preserve:**
- Token format and expiry (12h JWT)
- Backward compatibility with existing clients

**Verification:**
- Login via `/api/auth/login`
- Query `resq_login_attempts` table, verify row inserted
- Query `resq_audit_log` table, verify login_success action recorded

---

#### P2-9: No SQLAlchemy Models (Raw SQL Everywhere)

**Title:** All database queries use raw SQL text(), no ORM, no type safety

**Severity:** MEDIUM — Maintainability and discoverability

**Affected Components:**
- Backend: All routers use `text('SELECT ...')`
- Database: `backend/app/database/session.py` init_db() has DDL but no models.py

**Root Cause:**  
Intentional design decision to use raw SQL for explicitness. No SQLAlchemy declarative models created.

**Cross-Reference:**
- Database audit MEDIUM priority #4: "No SQLAlchemy models"

**What Needs to Change:**
1. **Long-term:** Create `backend/app/models.py` with declarative models for all 26 tables
2. Migrate queries incrementally from raw SQL to ORM
3. Add type hints based on models

**Files to Touch:**
- Create `backend/app/models.py` (new file)
- Gradually update routers and services to use ORM

**What to Preserve:**
- Existing schema structure and constraints
- Query behavior (ORM should produce equivalent SQL)

**Verification:**
- Run test suite (when created) to verify behavior unchanged
- Compare query performance before/after migration

**Decision Required:** Confirm this is desired (design tradeoff: explicitness vs. convenience).

---

### Priority 3: Low-Priority Polish and Enhancements

*(Abbreviated for brevity — full list available in individual audit reports)*

**P3-1:** Placeholder pages for Settings, Alerts, Plan, Spread (frontend)  
**P3-2:** Community actions not audited (backend)  
**P3-3:** Hard-coded placeholder emails in forms (frontend)  
**P3-4:** No loading states for some API calls (frontend)  
**P3-5:** Assessment presentation logic duplicated (frontend)  
**P3-6:** No E2E tests visible (project-wide)  
**P3-7:** Field Page API may be demo-only (frontend)  
**P3-8:** No WebSocket/SSE for community chat (backend/frontend)  
**P3-9:** Missing indexes on common queries (database)  
**P3-10:** Field reports orphaned on incident delete (database)  
**P3-11:** Forecast data disconnected from incidents (database)  
**P3-12:** No Alembic migrations (database)  
**P3-13:** No schema documentation until this audit (database)  
**P3-14:** Citizen map placeholder "No source connected" (frontend/backend)  
**P3-15:** Ranger report history unavailable (backend)

---

## 3. Preservation Checklist

These subsystems and files **MUST NOT** be modified unless a specific integration defect is discovered:

### AI Fire Evidence Assessor

**Status:** ✅ WORKING — Per user instructions: "Do not modify its model, checkpoint, preprocessing, inference architecture, or security configuration."

**Preserved Components:**
- `backend/app/services/image_assessment.py` — Assessment service and error codes
- Fire Assessor repository (external): Path at `FIRE_EVIDENCE_REPO` env var
- Artifact bundle: `FIRE_EVIDENCE_ARTIFACT_DIR`
- Model version: `fire-assessor-v1.0.0`
- Inference subprocess worker (timeout protection)
- Assessment status lifecycle: COMPLETED, UNAVAILABLE, EXPERIMENTAL
- Authenticity signals: NO_CONCERNS_FOUND, POSSIBLE_SYNTHETIC, etc.
- Decision: REQUIRES_REVIEW (always advisory)

**Integration Points (May Touch):**
- Display logic: `frontend/src/lib/assessmentPresentation.ts` (presentation only, not inference)
- API responses: May adjust field exposure but not assessment computation

**Verification:**
- After any changes near assessment flow, upload test image and verify assessment still completes
- Verify `assessment_status: 'COMPLETED'` in response
- Verify experimental outputs still displayed in staff views

---

### Database Schema Structure

**Preserved:**
- All 26 table definitions (structure, constraints, foreign keys)
- Audit log table and action taxonomy
- State-scoped permissions model
- Token rotation and reuse detection mechanism
- Idempotency keys (client_key, idempotency_key)
- SHA256 deduplication on images
- Alert deduplication window and keys

**Additive Changes Allowed:**
- New columns (via ALTER TABLE ADD COLUMN IF NOT EXISTS)
- New indexes
- New tables for missing features (e.g., announcements)

**Not Allowed Without Review:**
- Dropping tables or columns (data loss risk)
- Changing foreign key cascade rules (orphan risk)
- Removing unique constraints (duplicate risk)

---

### Security Configuration

**Preserved:**
- CSRF protection mechanism (double-submit cookie pattern)
- Token signing secret (RESQ_SECRET_KEY)
- Password hashing (Argon2 preferred, bcrypt fallback)
- Rate limiting on login (5 attempts per 15min window)
- Scope enforcement logic (require_scope, state filtering)
- Authorization role checks (require_roles, CONTROL_ROLES, PUBLIC_ROLES)

**Not Allowed:**
- Weakening authorization checks to make features work
- Removing CSRF protection
- Disabling rate limiting
- Changing token expiry without security review

---

### Working Workflows

**Preserve End-to-End:**
- Incident reporting (citizen) → persistence → alert generation
- Evidence upload → AI assessment → storage → display
- Control room status updates → audit log → citizen notification (once P1-2 fixed)
- Ranger assignment → acceptance → verification → completion
- Community posts/comments/chat → persistence → display
- Staff authentication → workspace routing
- Offline queue (legacy) — extend to redesign but don't break existing

---

### Build and Test Infrastructure

**Preserved:**
- `package.json` scripts (compile, dev, pr-check, etc.)
- Existing test configuration (if any)
- Runtime data directories (`backend/runtime_data/incident_images/`)
- Model bundle directories (`backend/models/barv3/`)

**Not Allowed:**
- Changing build output paths without updating all references
- Removing existing test commands

---

### Git and Version Control

**Preserved:**
- Current branch: main @ b151a593
- Existing user changes: 11 modified files, 11 untracked files
- No destructive git operations (no reset, clean, force push)

---

## 4. Implementation Sequence

Ordered by dependency and risk. Within each group, items are independent unless noted.

### Phase 0: Foundation (P0 Critical Fix)

**Goal:** Restore broken user-facing promise (Citizen→Community access)

**Items:**
1. **P0-1: Citizen Community Access** (1 file, low risk)
   - Add navigation link to `/community` in `CitizenShell`
   - Remove route trap at line 180
   - Verify authenticated citizens can access community

**Duration:** 1-2 hours  
**Risk:** LOW — Additive change, no backend modification  
**Blocks:** None (standalone fix)

---

### Phase 1: High-Priority Functional Gaps (P1)

**Goal:** Complete partially-implemented features that affect user value

**Items:**
1. **P1-1: Citizen Evidence Image Retrieval** (2 files, medium risk)
   - Add backend endpoint: `GET /api/citizen/reports/{report_id}/evidence/{image_id}`
   - Update frontend to display images
   - Blocks: P1-2 verification (want to see full citizen experience working)

2. **P1-2: Citizen Notification Display** (1 file, medium risk)
   - Add alert polling to CitizenApp
   - Display notification badge and list
   - Blocks: None (standalone)

3. **P1-3: Offline Queue for Redesign Routes** (3 files, high risk)
   - Generalize offline queue to support redesign API client
   - Apply to citizen and ranger critical actions
   - Blocks: None but requires careful testing

4. **P1-4: Citizen Fire Map** (2 files, high risk)
   - **Decision Required First:** Confirm public incident display policy
   - Add backend public incident feed endpoint OR mark as "Coming Soon"
   - Update frontend to display map
   - Blocks: Policy decision

5. **P1-5: Consolidate API Clients** (many files, very high risk)
   - **Decision Required First:** Choose Option A (consolidate) or B (harmonize)
   - Migrate legacy routes to redesign API client OR align error handling
   - Blocks: None but affects all legacy routes

**Duration:** 1-2 weeks  
**Risk:** MEDIUM-HIGH — Involves new backend endpoints and cross-cutting frontend changes  
**Blocks:** Phase 2 (want core functionality complete before addressing consistency issues)

**Recommendation:** Implement P1-1, P1-2, P1-3 immediately. Defer P1-4 and P1-5 pending stakeholder decisions.

---

### Phase 2: Medium-Priority Consistency and UX (P2)

**Goal:** Reduce maintenance burden and improve UX consistency

**Items:**
1. **P2-1: Deprecate Duplicate Incident Triage** (redirection, low risk)
   - Redirect `/app/incidents` → `/control-room/incidents`
   - Remove legacy implementation after transition period

2. **P2-3: Consolidate Status Labels** (shared constants, low risk)
   - Extract STATUS_LABELS to shared module
   - Update imports

3. **P2-4: Increase Chat Polling Interval** (1 line change, low risk)
   - Change from 5s to 10s or 15s

4. **P2-5: Remove Banner from Operational Routes** (conditional logic, low risk)
   - Update banner display logic

5. **P2-8: Add Audit Log to Legacy Login** (1 endpoint, low risk)
   - Add login attempt recording and audit log write

6. **P2-7: Enable Spread Job Endpoint** (high risk, decision required)
   - **Decision Required:** Review authorization decisions document
   - Implement approved access controls

7. **P2-9: Create SQLAlchemy Models** (long-term, very high risk)
   - Create models.py
   - Migrate queries incrementally
   - **Defer to future sprint**

**Duration:** 1-2 weeks  
**Risk:** LOW-MEDIUM for most items; HIGH for P2-9  
**Blocks:** Phase 3 (polish after core issues resolved)

---

### Phase 3: Low-Priority Enhancements (P3)

**Goal:** Technical debt reduction and future-proofing

**Items:**
- Implement placeholder pages (Settings, Alerts, Plan)
- Add E2E test suite
- WebSocket/SSE for community chat
- Add missing database indexes
- Fix field report orphan issue
- Create schema documentation
- Initialize Alembic migrations

**Duration:** Ongoing maintenance  
**Risk:** LOW — Nice-to-have improvements  
**Blocks:** None (continuous improvement)

---

## 5. Implementation Notes for Critical Paths

### Citizen→Community Integration (P0-1)

**Context:** Community exists at `/community`, Citizen exists at `/citizen/*`. No bridge between them.

**Solution:** Add navigation link from Citizen interface to top-level `/community` route.

**Implementation Steps:**

1. **Update CitizenShell navigation** (file: `frontend/src/redesign/pages/CitizenApp.tsx` lines 103-112)
   ```typescript
   // Add after "Stay safe" link:
   <a href="/community" className="nav-link">
     Community
   </a>
   ```

2. **Remove route trap** (file: `frontend/src/redesign/pages/CitizenApp.tsx` line 180)
   ```typescript
   // DELETE THIS LINE:
   if (path.startsWith('/citizen/community')) return <CitizenUnavailablePage go={go} title="Community discussions unavailable" />;
   ```

3. **Add to mobile bottom tabs** (optional, lines 120-130)
   ```typescript
   // Replace one of the less-used tabs (e.g., Fire Map if still placeholder) with Community
   ```

4. **Update landing page promise** (if needed)
   - File: `frontend/src/redesign/pages/PublicPortal.tsx`
   - Ensure Citizen card description matches delivered features

**Testing Checklist:**
- [ ] Navigate to `/citizen` as authenticated citizen
- [ ] See "Community" link in desktop header
- [ ] Click "Community", verify `/community` loads
- [ ] Verify citizen can create posts (role check)
- [ ] Verify citizen can send chat messages (rate limit check)
- [ ] Navigate back to `/citizen` via header links
- [ ] Test on mobile: verify Community accessible via bottom tabs or menu

**Rollback Plan:** Restore route trap line if community access causes issues.

---

### Citizen Evidence Image Retrieval (P1-1)

**Context:** Citizens can upload images but cannot view them. Storage and assessment work correctly.

**Solution:** Add backend retrieval endpoint with reporter ownership check.

**Backend Implementation:**

File: `backend/app/routers/citizen.py`

```python
@router.get('/reports/{report_id}/evidence/{image_id}', dependencies=[Depends(require_csrf)])
async def get_citizen_evidence_image(
    report_id: int,
    image_id: int,
    db: AsyncConnection = Depends(get_db),
    user: dict = Depends(citizen_user),
):
    """
    Retrieve evidence image for citizen-owned report.
    Authorization: Reporter must own the report.
    """
    # Verify ownership
    ownership_check = await db.execute(text("""
        SELECT i.id FROM resq_incidents i
        WHERE i.id = :report_id AND i.reporter_id = :user_id
    """), {"report_id": report_id, "user_id": user['id']})
    
    if not ownership_check.fetchone():
        raise HTTPException(status_code=404, detail="Report not found or not owned by you")
    
    # Fetch image metadata
    result = await db.execute(text("""
        SELECT storage_key, content_type, original_filename
        FROM resq_incident_images
        WHERE id = :image_id AND incident_id = :report_id
    """), {"image_id": image_id, "report_id": report_id})
    
    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Evidence not found")
    
    # Read file from disk
    image_path = IMAGE_ROOT / row['storage_key']
    if not image_path.exists():
        raise HTTPException(status_code=404, detail="Image file not found on disk")
    
    # Return binary with caching headers
    return FileResponse(
        path=str(image_path),
        media_type=row['content_type'],
        filename=row['original_filename'],
        headers={
            "Cache-Control": "public, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        }
    )
```

**Frontend Implementation:**

File: `frontend/src/redesign/pages/CitizenApp.tsx` (CitizenReportDetailPage component)

```typescript
// In evidence display section, replace text-only display with image:
{evidence.map(img => (
  <div key={img.id} className="evidence-item">
    <img 
      src={`/api/citizen/reports/${report.id}/evidence/${img.id}`}
      alt={img.original_filename}
      loading="lazy"
      onError={(e) => { e.target.src = '/placeholder-image-error.svg'; }}
    />
    <div className="evidence-meta">
      <span>{img.original_filename}</span>
      <span className={`assessment-status ${img.assessment_status}`}>
        {img.assessment_status}
      </span>
    </div>
  </div>
))}
```

**Testing Checklist:**
- [ ] As citizen, upload evidence to report
- [ ] Navigate to `/citizen/reports/{id}`
- [ ] Verify image displays (not just filename)
- [ ] Verify assessment status badge shown
- [ ] Test as different citizen, verify 404 (ownership check)
- [ ] Test image caching (second load from browser cache)

---

### Citizen Notification Display (P1-2)

**Context:** Backend generates alerts on status changes. Frontend doesn't display them.

**Solution:** Poll `/api/alerts` and show notification badge in CitizenShell header.

**Frontend Implementation:**

File: `frontend/src/redesign/pages/CitizenApp.tsx`

```typescript
// Add polling hook at top of CitizenApp component:
const [alerts, setAlerts] = useState<any[]>([]);
const [unreadCount, setUnreadCount] = useState(0);

useEffect(() => {
  if (!session.user) return;
  
  const fetchAlerts = async () => {
    try {
      const data = await rqFetch('/api/alerts');
      const unread = data.filter((a: any) => !a.read);
      setAlerts(data);
      setUnreadCount(unread.length);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    }
  };
  
  fetchAlerts();
  const interval = setInterval(fetchAlerts, 30000); // Poll every 30s
  return () => clearInterval(interval);
}, [session.user]);

// Add notification badge to CitizenShell header:
<a href="/citizen/notifications" className="nav-link">
  Notifications
  {unreadCount > 0 && <span className="badge">{unreadCount}</span>}
</a>

// Add notification page route:
if (path === '/citizen/notifications') {
  return (
    <CitizenShell>
      <div className="notifications-page">
        <h1>Notifications</h1>
        {alerts.length === 0 ? (
          <p>No notifications</p>
        ) : (
          <ul>
            {alerts.map(alert => (
              <li key={alert.id} className={alert.read ? 'read' : 'unread'}>
                <div className="alert-message">{alert.message}</div>
                <div className="alert-time">{new Date(alert.created_at).toLocaleString()}</div>
                {!alert.read && (
                  <button onClick={async () => {
                    await rqFetch(`/api/alerts/${alert.id}/read`, { method: 'PATCH' });
                    setAlerts(prev => prev.map(a => a.id === alert.id ? {...a, read: true} : a));
                    setUnreadCount(prev => prev - 1);
                  }}>
                    Mark read
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </CitizenShell>
  );
}
```

**Testing Checklist:**
- [ ] As control room, update incident status for citizen report
- [ ] As citizen (report owner), verify notification badge appears
- [ ] Click notifications link, verify alert message displayed
- [ ] Click "mark read", verify badge count decrements
- [ ] Verify only citizen's own alerts visible (not all alerts)
- [ ] Test polling: Wait 30s, verify new alerts appear without refresh

---

## 6. Testing and Verification Strategy

### Per-Fix Verification

Each fix must include:
1. **Manual testing checklist** (see implementation notes above)
2. **Regression check:** Verify related workflows still work
3. **Cross-browser test:** Chrome, Firefox, Safari (mobile Safari for mobile features)

### Integration Testing (After Phase 0 and Phase 1)

**Citizen Complete Workflow:**
1. Register as new citizen
2. Create incident report with location and description
3. Upload evidence image
4. View report in "My Reports", verify image displays (P1-1)
5. Navigate to Community via header link (P0-1)
6. Create community post
7. Send chat message
8. Return to Citizen dashboard
9. (As control room) Update incident status
10. (As citizen) Verify notification appears (P1-2)
11. Click notification, verify alert message
12. (Offline test) Disconnect network, submit report, verify queued (P1-3)
13. Reconnect, verify report syncs

**Ranger Complete Workflow:**
1. (As control room) Create incident and assign to ranger
2. (As ranger) Accept assignment
3. Navigate to field, mark in_progress
4. (Offline test) Disconnect network, submit verification, verify queued (P1-3)
5. Reconnect, verify verification syncs
6. Upload evidence
7. (As control room) Verify verification received and alert generated

**Control Room Complete Workflow:**
1. Review incident queue
2. Review evidence with AI assessment
3. Submit human review
4. Update incident status
5. Assign ranger
6. Review field verification
7. Close incident
8. Verify audit log complete

### Automated Testing (P3, Future)

**Recommended Test Suite:**
- Unit tests for API clients (mock fetch)
- Integration tests for backend endpoints (FastAPI TestClient)
- E2E tests for critical workflows (Playwright or Cypress)
- Accessibility tests (axe-core)

---

## 7. Rollback and Risk Mitigation

### Per-Fix Rollback Plans

**P0-1 (Citizen Community):**
- Restore route trap line if community access causes issues
- Remove navigation link
- Risk: LOW (additive change)

**P1-1 (Evidence Retrieval):**
- Remove backend endpoint
- Revert frontend image display to text-only
- Risk: MEDIUM (new endpoint, but read-only)

**P1-2 (Notifications):**
- Remove polling hook and notification page
- Risk: LOW (additive change)

**P1-3 (Offline Queue):**
- Revert API client changes
- Disable offline queue for redesign routes
- Risk: HIGH (affects error handling for all redesign routes)

**P1-5 (API Client Consolidation):**
- Revert all legacy route changes
- Restore dual API clients
- Risk: VERY HIGH (touches many files)

### Risk Mitigation Strategies

1. **Feature Flags:** Consider adding feature flags for P1-3, P1-5 (high-risk changes)
2. **Staged Rollout:** Deploy P0-1, P1-1, P1-2 first (low-medium risk)
3. **Monitoring:** Add logging for new endpoints (evidence retrieval, offline queue sync)
4. **User Communication:** Announce Community access to citizens via in-app announcement

---

## 8. Open Questions and Decisions Required

### Decision 1: Public Fire Map Policy (P1-4)

**Question:** Should citizens see public incident data on map?

**Options:**
- A. Yes, show verified/responding/contained incidents (exclude 'reported' for privacy)
- B. No, mark as "Coming Soon" due to privacy/policy concerns
- C. Yes, but state-scoped only (citizens see incidents in their home state)

**Stakeholders:** Product, Legal, Operations

**Impact:** Affects P1-4 implementation scope and timeline

---

### Decision 2: API Client Consolidation (P1-5)

**Question:** Consolidate two API clients or harmonize them?

**Options:**
- A. Consolidate: Migrate legacy routes to redesign API client, retire `lib/api.ts`
- B. Harmonize: Align error handling without merging clients
- C. Defer: Keep separate clients, accept maintenance burden

**Stakeholders:** Engineering, Product

**Impact:** Affects many files, high risk, long implementation time for Option A

**Recommendation:** Option B (harmonize) as interim, Option A (consolidate) as future tech debt project

---

### Decision 3: Legacy Interface Deprecation (P2-1)

**Question:** Deprecate legacy staff workspace (`/app/*`) in favor of redesign (`/control-room/*`, `/ranger/*`)?

**Options:**
- A. Yes, redirect legacy routes to redesign, sunset legacy in 3-6 months
- B. No, maintain both indefinitely
- C. Hybrid: Deprecate some legacy routes (e.g., incidents) but keep others (e.g., map, brief)

**Stakeholders:** Product, Ops (staff users)

**Impact:** Affects maintenance burden and user training

---

### Decision 4: Authorization for Spread Jobs (P2-7)

**Question:** Enable spread job submission endpoint?

**Status:** Currently returns 503 per `RESQ9_AUTH_DECISIONS_FOR_APPROVAL.md`

**Required:** Review authorization decisions document, confirm design approved

**Stakeholders:** Engineering, Security

---

## 9. Success Metrics

### Phase 0 Success (P0 Fix)

- [ ] 100% of citizens can access community features from Citizen interface
- [ ] Zero "community unavailable" stub pages encountered by users
- [ ] Community engagement increases (measure post/chat activity from citizen role)

### Phase 1 Success (P1 Fixes)

- [ ] Citizens can view 100% of uploaded evidence images
- [ ] Citizens receive notifications for status changes (measure alert delivery rate)
- [ ] Offline report submissions succeed 100% when reconnected (measure sync success rate)
- [ ] Zero evidence retrieval 404 errors for owned reports

### Phase 2 Success (P2 Improvements)

- [ ] Legacy incident route traffic drops to near-zero (measure redirect success)
- [ ] Chat polling interval increased with no user complaints (measure message latency)
- [ ] Audit log captures 100% of login events (measure log completeness)

### Overall Success

- [ ] All four user experiences (Community, Citizen, Ranger, Control Room) fully functional
- [ ] Zero P0 defects remaining
- [ ] < 5 P1 defects remaining (deferred with clear timeline)
- [ ] User satisfaction scores improve (if measured)
- [ ] Development velocity improves (fewer bugs, clearer codebase)

---

## 10. Appendix: Full Defect Cross-Reference Table

| ID | Title | Frontend | Backend | Database | Priority | Status |
|----|-------|----------|---------|----------|----------|--------|
| P0-1 | Citizen community access | CitizenApp.tsx:180 | N/A | N/A | CRITICAL | Open |
| P1-1 | Evidence image retrieval | CitizenApp.tsx | citizen.py | Images stored | HIGH | Open |
| P1-2 | Citizen notifications | CitizenApp.tsx | alert_service.py | resq_alerts | HIGH | Open |
| P1-3 | Offline queue redesign | api.ts, offlineQueue.ts | N/A | N/A | HIGH | Open |
| P1-4 | Citizen fire map | CitizenApp.tsx | No public feed | N/A | HIGH | Open |
| P1-5 | API client consolidation | lib/api.ts, redesign/lib/api.ts | N/A | N/A | MEDIUM-HIGH | Open |
| P2-1 | Duplicate incident triage | IncidentsListPage.tsx, ControlRoomApp.tsx | N/A | N/A | MEDIUM | Open |
| P2-3 | Inconsistent status labels | IncidentsListPage.tsx:55, ControlRoomApp.tsx:20 | N/A | N/A | MEDIUM | Open |
| P2-4 | Chat polling frequency | PublicPortal.tsx:104 | community.py | N/A | MEDIUM | Open |
| P2-5 | Saved examples banner | RedesignRoot.tsx:57 | N/A | N/A | MEDIUM | Open |
| P2-7 | Spread job 503 | N/A | operations.py:640 | N/A | MEDIUM | Blocked |
| P2-8 | Legacy login no audit | N/A | auth.py:30-39 | resq_audit_log | MEDIUM | Open |
| P2-9 | No SQLAlchemy models | N/A | All routers | session.py | MEDIUM | Open |
| P3-* | Various enhancements | Multiple | Multiple | Multiple | LOW | Open |

---

## 11. Conclusion

TerraWatch is a **substantially complete application** with one critical integration gap (P0-1) and several high-priority feature gaps (P1) that prevent it from being fully production-ready.

**Immediate Actions (Week 1):**
1. Fix P0-1 (Citizen community access) — 1 file, 2 hours
2. Implement P1-1 (Evidence retrieval) — 2 files, 1 day
3. Implement P1-2 (Notifications) — 1 file, 1 day

**Near-Term Actions (Weeks 2-4):**
4. Implement P1-3 (Offline queue) — 3 files, 3-5 days with thorough testing
5. Resolve decisions for P1-4 (public map policy) and P1-5 (API consolidation)
6. Address P2 items (consistency and polish)

**Long-Term Actions (Future Sprints):**
7. P3 enhancements (WebSocket chat, E2E tests, schema documentation)
8. P2-9 (SQLAlchemy models) as tech debt reduction project
9. Legacy interface deprecation (P2-1) with user migration plan

**The application is ready for production deployment after Phase 0 and Phase 1 are complete.** All core workflows are functional; the remaining work is about completeness, consistency, and user experience polish.

---

**END OF REMEDIATION PLAN**
