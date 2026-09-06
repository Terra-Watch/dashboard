 # Jalari role architecture

This repository owns the shore-side web product. The fisherman/crew/owner/commander/companion application is external and is not implemented under `frontend/`.

## System roles

| Role | Account creation | Web entry | Web permissions | Status |
| --- | --- | --- | --- | --- |
| `ADMIN` | Admin | `/login` → `/dashboard` | Operations plus user, assignment, boat lifecycle, and audit administration | Implemented |
| `OPERATOR` | Admin or permitted operator policy | `/login` → `/dashboard` | Fleet, telemetry, history, alerts, gateways, and permitted boat operations | Implemented |
| `FAMILY` | Admin/operator provisioning | `/login` → `/family` | Only active, backend-authorized family vessels, incidents, trips, and profile | Implemented |
| `FISHERMAN` / `CREW` | Provisioned for the external vessel app | External app | Not a website dashboard role | Deliberately out of scope |

`OWNER`, `COMMANDER`, `CREW`, and `FAMILY_VIEWER` are boat relationship values, not system roles. They are stored on `user_boats` with assignment status and timestamps.

## Authentication and authorization

The backend authenticates the user from the signed token and loads the current database account. Route dependencies enforce system role. Resource checks enforce active boat assignment; client metadata and URL values do not grant family access. Suspended or archived accounts cannot authenticate, and suspended/archived boats cannot be accessed by family users.

## Lifecycle

- Users: `ACTIVE`, `SUSPENDED`, `ARCHIVED`; lifecycle transitions are audited.
- Boats: `ACTIVE`, `SUSPENDED`, `INACTIVE`, `ARCHIVED`; lifecycle transitions are audited.
- Assignments: `ACTIVE` or `ENDED`; ending an assignment preserves the user and relationship row.
- Passwords, OTPs, JWTs, and secrets are never written to the audit log.

## Website routes

- Family: `/family`, `/family/boat/[boatId]`, `/family/incident/[incidentId]`, `/profile/family`
- Operations: `/dashboard`, `/dashboard/boats`, `/dashboard/boats/[boatId]`, `/dashboard/alerts`, `/dashboard/telemetry`, `/dashboard/history`, `/profile/operator`
- Administration: `/dashboard/users`, `/dashboard/audit`, `/profile/admin`

The website uses one login system and redirects based on the backend-returned role. The dashboard guard permits only `ADMIN` and `OPERATOR`; external fisherman/crew/rescuer clients do not fall through into the operations UI.

## Operational scope

Operators are assigned explicit active boat scope through `operator_boat_access`; administrators grant and revoke that scope from the Users page. Boat, telemetry, history, alert, and assignment requests enforce it on the backend. Gateways and system status are intentionally global operational resources because they describe shore infrastructure, not a boat-specific resource.

## Logout and lifecycle policy

Logout is stateless JWT logout: the frontend removes its token and cached profile. There is no server-side revocation endpoint; account-status checks still reject suspended or archived users. Archived users are not directly restorable. Boats support `ACTIVE`, `SUSPENDED`, `INACTIVE`, and `ARCHIVED`; inactive boats can be restored by an authorized operations user, while archive is an administrative terminal state.
