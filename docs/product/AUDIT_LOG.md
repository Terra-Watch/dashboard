# Audit log — interface contract

Owned by `resq9/product-pass`. Specified here so `resq8/firms-ingestion` (and any other branch)
can code against a stable contract before the implementation lands in Step 1a. Not implemented
yet — this doc is the interface, `backend/app/services/audit_log.py` doesn't exist until Step 1a.
`resq8/firms-ingestion` is not touched by this doc; it was only read (`git show`) to confirm the
shape it needs (its own `docs/ingest/00_design.md` §8a).

## Table: `resq_audit_log`

Single table, all domains (auth, triage/field actions, ingestion triage). `entity_type`
disambiguates domain, not a separate table per domain — per `00_plan.md` §1.2/1.7.

```sql
CREATE TABLE IF NOT EXISTS resq_audit_log (
    id BIGSERIAL PRIMARY KEY,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_id INT REFERENCES resq_users(id),       -- NULL for unauthenticated events (e.g. login_failed)
    device_id TEXT,                               -- NULL when not applicable
    action TEXT NOT NULL,
    previous_state TEXT,                           -- NULL when the action has no prior-state concept
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,                       -- always a string; callers cast their own id type
    metadata JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS resq_audit_log_entity_idx ON resq_audit_log (entity_type, entity_id, occurred_at DESC);
```

The index exists specifically to make "latest action for entity X" (below) cheap — this is the
query `resq8`'s §8a flagged as needed and not yet confirmed to exist.

## Write

```python
def write_audit_log(
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    user_id: int | None = None,
    device_id: str | None = None,
    previous_state: str | None = None,
    metadata: dict | None = None,
) -> None: ...
```

- `previous_state` is computed by the **caller** before applying the new state — the audit log
  never infers it by scanning history (this fixes the current ad-hoc `redesign_store.py`
  behavior, which does infer it; see `00_plan.md` §1.7). For `resq8`'s triage actions, this is
  whatever `latest_status_by_detection()`-equivalent value was true immediately before the
  `POST /detections/{id}/actions` request being handled.
- Exactly the fields `resq8`'s §8a asked for: `{entity_type, entity_id, action, previous_state,
  role, device_id, timestamp}` — `role` and `timestamp` map to `user_id` (role is looked up from
  the authenticated user, not passed as a free string once real auth lands) and `occurred_at`
  (server-set, not caller-set, so clock skew across services can't be written into the log).

## Read: latest status per entity

This is the piece `resq8`'s §8a said might not exist yet — it now does, specified here:

```python
def get_latest_action(entity_type: str, entity_id: str) -> AuditEntry | None: ...

def get_latest_actions(entity_type: str, entity_ids: list[str]) -> dict[str, AuditEntry]: ...
```

`get_latest_actions` (plural) exists specifically so `GET /detections` (Watch's list endpoint)
can resolve every row's `status` in one query, not N — the single-entity form is for detail
views (`GET /detections/{id}/history`-adjacent use). `AuditEntry` is whatever this doc's table
row shape is once typed in Step 1a (`action`, `previous_state`, `occurred_at`, `user_id`,
`metadata`); `resq8` reads `.action` as the new status directly, matching what
`redesign_store.latest_status_by_detection()` returns today for the demo path.

## Entity-identifier contract

- `entity_type` for `resq8`'s own rows: `'detection'` or `'candidate'`, matching its own
  `resq_firms_detections` / `resq_incident_candidates` primary keys exactly (cast to `str`).
- Other domains already planned: `entity_type='session'` (login/logout/refresh events, `user_id`
  as entity_id), `entity_type='invite'`, `entity_type='field_report'`. No collision risk between
  domains since `(entity_type, entity_id)` is the lookup key, not `entity_id` alone.

## Event types (`action` values)

| Domain | `action` values | `entity_type` | Written by |
|---|---|---|---|
| Auth/session | `login_success`, `login_failed`, `logout`, `token_refresh`, `token_refresh_reuse_detected`, `permission_denied` | `session` | `resq9` (Step 1a) |
| Invites | `invite_created`, `invite_accepted` | `invite` | `resq9` (Step 1a) |
| Password reset | `password_reset_admin_initiated`, `password_reset_completed` | `session` | `resq9` (Step 1a) |
| Detection/candidate triage | `verify`, `dismiss`, `escalate` | `detection` \| `candidate` | **`resq8`**, through this interface, once Step 1a exists |
| Field reports | existing `triage_actions`-equivalent field-report events (migrated from `redesign_store.py`, names unchanged) | `field_report` | `resq9` (Step 1a) |

No action string is reused across domains with a different meaning — `verify`/`dismiss`/
`escalate` are reserved for triage (`detection`/`candidate`) only.

## What's not decided here

- The exact Python import path/package layout beyond `backend/app/services/audit_log.py` — a
  Step 1a implementation detail, not an interface question.
- Whether `resq8` gets a direct DB read or must go through an HTTP endpoint if it ends up in a
  different process — out of scope for this doc; both branches live in the same backend today,
  so a direct function call is assumed unless that changes.

Stopping here — this is a Step 0 planning deliverable (docs only), not Step 1 code.
