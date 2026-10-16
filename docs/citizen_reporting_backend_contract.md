# Future citizen reporting backend contract

TerraWatch currently has no citizen-authenticated reporting contract. The public Citizen page therefore hands off to the existing staff-authenticated flow and never claims that a report was created. A future citizen workflow must be designed and approved before a public submission endpoint is added.

## Required contract

- **Identity and authentication:** provide a distinct citizen identity flow (for example, verified email or an approved federated identity), short-lived access tokens, refresh/session revocation, CSRF protection for browser writes, and explicit consent and privacy notices. Do not reuse staff roles or allow a client-selected role.
- **Ownership and access control:** every report must have an immutable `reporter_id`; citizens may read only their own reports and status history. Staff access must remain role- and geographic-scope controlled. Evidence and reviewer notes must never be returned by a public list endpoint.
- **Report request:** accept a validated schema such as `client_key`/idempotency key, observed time, location, description, contact preference, and optional evidence metadata. Validate coordinates, text lengths, timestamps, and required consent server-side.
- **Evidence upload:** use a separate authenticated multipart upload or pre-signed private upload flow. Accept only JPEG, PNG, and WebP after content sniffing; enforce the existing 10 MB limit unless a reviewed policy changes it; hash content, store outside the public web root, and retain only a safe filename. Never expose storage keys directly.
- **Duplicate and idempotency behavior:** bind an idempotency key to the authenticated reporter and request payload. A retry must return the original report reference and must not create another report or duplicate evidence. Conflicting reuse must fail with a validation error.
- **Audit events:** record report creation, evidence upload, status transitions, access, export, and deletion/retention events with actor, timestamp, report ID, request/device metadata, and outcome. Do not put report text or image contents in logs.
- **Status and history:** define a minimal citizen-safe state machine such as `RECEIVED`, `UNDER_REVIEW`, `ACTIONED`, and `CLOSED`, with timestamps and safe explanations. Do not expose internal reviewer notes, private evidence assessments, staff identities, or operational incident records.
- **Errors and limits:** specify `401` for missing/expired identity, `403` for ownership/scope denial, `409` for conflicting idempotency, `413` for oversized evidence, `415` for unsupported/mismatched media, `422` for invalid fields, and `429` for rate limits. Fail closed when storage, assessment, or audit persistence is unavailable.

This document is a readiness requirement, not an implemented API. The current staff routes and role allowlists remain unchanged.
