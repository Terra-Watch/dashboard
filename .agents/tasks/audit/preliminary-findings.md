# TerraWatch Application Audit - Preliminary Findings

**Audit Date:** 2026-10-16  
**Repository:** ~/Desktop/Projects/RESQ/website  
**Branch:** main @ b151a5932cccce2bc5a064f399c7d543c23e1e3e  
**Status:** Parallel audit in progress, preliminary findings documented

---

## CRITICAL FINDING: Community Access Blocked from Citizen Interface

### P1 - Core Workflow Broken

**Issue:** Citizens cannot access Community features despite full backend support

**Evidence:**
1. **Backend APIs exist and functional:**
   - `GET/POST /api/community/posts` 
   - `GET/POST /api/community/posts/{id}/comments`
   - `GET/POST /api/community/chat`
   
2. **Database tables exist:**
   - `resq_community_posts`
   - `resq_community_messages`
   - `resq_community_comments`
   - `resq_community_reports`

3. **Working implementation exists:**
   - `PublicPortal.tsx` has fully functional `CommunityPage` component
   - Loads posts, chat messages
   - Supports posting, chatting, comments
   - Has proper authentication integration
   - Polls for updates every 5 seconds

4. **Citizen interface deliberately blocks access:**
   - File: `frontend/src/redesign/pages/CitizenApp.tsx:180`
   - Code: `if (path.startsWith('/citizen/community')) return <CitizenUnavailablePage go={go} title="Community discussions unavailable" />;`
   - Navigation missing: No Community link in Citizen shell (lines 16-20)

**Impact:** **SEVERE**
- Citizens have no way to participate in community discussions
- Fully functional backend feature is inaccessible
- Users expect community features based on landing page messaging
- Breaks "Community/Citizen" unified experience advertised

**Root Cause:** Incomplete frontend integration - backend and database complete, frontend blocked with placeholder

**Fix Required:**
1. Add Community navigation link to Citizen shell
2. Replace `CitizenUnavailablePage` with Community implementation
3. Either:
   - Option A: Route `/citizen/community` to existing `CommunityPage` from PublicPortal
   - Option B: Create Citizen-specific Community view with same backend
4. Ensure authenticated citizens can post/chat (already supported by backend)

---

## Repository Structure Findings

### Frontend Architecture
```
frontend/src/
├── pages/                  # Legacy implementation
│   ├── AuthPage.tsx
│   ├── OperationsPage.tsx
│   ├── PublicPage.tsx
│   └── [12 other pages]
├── redesign/pages/         # Current implementation (PRIMARY)
│   ├── CitizenApp.tsx      ⚠️ Community blocked here
│   ├── CitizenAuthPage.tsx
│   ├── ControlRoomApp.tsx
│   ├── PublicPortal.tsx    ✅ Community works here
│   ├── RangerApp.tsx
│   ├── FieldPage.tsx
│   ├── OfflineDemoPage.tsx
│   └── [6 other pages]
└── features/operations/    # Legacy operational pages
    └── [13 component pages]
```

**Observation:** Parallel implementations exist - need to determine authoritative version for each feature

### Backend Architecture
```
backend/app/routers/
├── auth.py          # 15 endpoints (login, register, tokens, invites)
├── citizen.py       # 4 endpoints (reports, evidence) ✅ Working
├── community.py     # 7 endpoints (posts, comments, chat) ✅ Working
├── operations.py    # 27 endpoints (incidents, images, alerts, plans)
├── workflow.py      # 11 endpoints (assignments, verifications, ranger)
├── redesign.py      # 10 endpoints (detections, field reports, replay, simulation)
└── risk.py          # 2 endpoints (daily risk, geojson)
```

**Total:** 76 documented backend endpoints

### Database Schema
```
25 tables identified:
✅ Core: resq_users, resq_incidents, resq_incident_images
✅ Community: resq_community_posts, resq_community_messages, resq_community_comments, resq_community_reports
✅ Operations: resq_field_reports, resq_field_verifications, resq_incident_assignments
✅ Auth: resq_access_requests, resq_invites, resq_refresh_tokens, resq_login_attempts
✅ Alerts: resq_alerts, resq_alert_rules
✅ Audit: resq_audit_log
✅ Risk: cells, cell_scores, forecast_runs
✅ Plans: resq_plans
✅ Settings: resq_user_settings, resq_user_scopes
✅ Password: resq_password_resets, resq_password_reset_requests
```

---

## User Experience Gaps Identified

### 1. CITIZEN Experience
**Status:** Partially Complete

✅ **Working:**
- Authentication (login/register)
- Incident reporting
- Image evidence upload (backend works, frontend auth issue)
- My Reports view
- Fire Map (empty state)
- Safety information

❌ **Broken/Missing:**
- **Community access** (P1 - completely blocked)
- **Image upload from browser** (auth/CSRF issue from earlier debugging)
- No notifications view
- No announcements view
- Report status updates not visible to citizen

### 2. COMMUNITY Experience  
**Status:** Working but Isolated

✅ **Working at `/community`:**
- Public discussion posts
- Chat messages
- Comments (endpoint exists, UI unclear)
- Archive view
- Authentication integration
- Real-time polling

❌ **Issues:**
- Not accessible from Citizen interface (P1)
- Unclear moderation workflow
- No admin announcement system visible

### 3. CONTROL ROOM Experience
**Status:** Needs Investigation (workflow audit in progress)

Known endpoints:
- Incident list/detail
- Image review
- Evidence assessment
- Status changes
- Assignment management

**Pending:** Workflow audit will determine if data flows correctly

### 4. RANGE OFFICER Experience
**Status:** Needs Investigation (workflow audit in progress)

Known endpoints:
- `/api/ranger/assignments`
- `/api/ranger/assignments/{id}/verification`
- `/api/ranger/assignments/{id}/evidence`
- `/api/redesign/field/reports`

**Pending:** Workflow audit will determine completeness

---

## Fire Evidence Assessor Status

✅ **VERIFIED WORKING - DO NOT MODIFY**

- Checkpoint downloaded: 345 MB
- All 91 tests pass
- Experimental inference functional
- Backend integration complete
- Assessment persistence working

**Note:** Earlier citizen image upload failure was authentication issue, not AI issue

---

## Next Steps

**Awaiting workflow completion** for:
1. Complete frontend route inventory
2. Complete backend endpoint mapping
3. Data flow verification
4. Defect classification across all four experiences

**Ready to fix immediately:**
- P1: Citizen→Community access (root cause known, fix clear)
- P1: Citizen image upload auth issue (from earlier session)

**Requires deeper investigation:**
- Legacy vs Redesign route ownership
- Control Room workflow completeness
- Range Officer workflow completeness
- Notification/announcement flows
- Cross-role data visibility

---

## Preservation Status

✅ **All user changes preserved:**
- 11 modified files intact
- 11 untracked files intact
- No commits made
- No destructive operations
- Fire Evidence Assessor untouched

**Modified files:**
- backend/.env.example
- backend/app/services/image_assessment.py
- backend/tests/fixtures/fire_evidence/approved/artifact.json
- backend/tests/test_fire_evidence_adapter.py
- backend/tests/test_fire_evidence_routes.py
- docs/fire_evidence_integration.md
- frontend/src/features/operations/IncidentsListPage.tsx
- frontend/src/features/operations/IncidentsPage.tsx
- frontend/src/lib/assessmentPresentation.ts
- frontend/src/redesign/pages/ControlRoomApp.tsx
- frontend/unit/assessmentPresentation.unit.ts

All preserved and will not be overwritten.
