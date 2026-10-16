# Fire Evidence Assessor — dashboard integration

Status: **inference disabled.** No complete, approved artifact exists. Every upload is persisted with
`assessment_status = UNAVAILABLE` and a structured error code. Nothing here enables operational inference.

Verified only against this repository at base commit `48789ee` (read-only clone), not against any other working tree.

## Contract (`fire-assessor-artifact/1`)
Bundle directory: `artifact.json` + `weights.pt` + `arrays.npz`. The adapter refuses unless all hold:
- `artifact_format` is `fire-assessor-artifact/1` and `model_version` equals `FIRE_EVIDENCE_MODEL_VERSION`.
- Output mapping is exactly `0 -> flames_visible`, `1 -> smoke_visible`.
- Files present, and SHA-256 of `weights.pt` / `arrays.npz` match `artifact.json`.
- Derived status is `APPROVED`: approval record (approver, approved_at, scope, evidence) exists and its
  `artifact_binding_sha256` equals SHA-256 of canonical JSON (`sort_keys`, separators `(",", ":")`, ASCII) of
  `artifact.json` without `approval` and `artifact_status`. Calibration and OOD sections must be present.
- Assessor's own loader accepts it (checkpoint architecture check). A mismatch becomes `MODEL_ARTIFACT_INCOMPATIBLE`.
- `FIRE_EVIDENCE_INFERENCE_ENABLED` is exactly `true` (default off).

The stdlib pre-flight needs neither torch nor the assessor, so refusals carry distinct codes everywhere.

## Error codes (all stored as UNAVAILABLE, never as a fire result)
| Code | Meaning |
|---|---|
| MODEL_ARTIFACT_NOT_CONFIGURED | env paths unset |
| MODEL_INFERENCE_DISABLED | enable flag not `true` |
| MODEL_ARTIFACT_NOT_FOUND | directory/file missing |
| MODEL_ARTIFACT_MALFORMED | unreadable/invalid JSON or fields |
| MODEL_ARTIFACT_UNSUPPORTED_VERSION | unknown format version |
| MODEL_ARTIFACT_VERSION_MISMATCH | model_version differs from expected |
| MODEL_ARTIFACT_INTEGRITY_FAILED | SHA-256 mismatch |
| MODEL_ARTIFACT_INVALID_OUTPUT_MAPPING | label mapping not as above |
| MODEL_ARTIFACT_INCOMPLETE | calibration/OOD/files missing |
| MODEL_ARTIFACT_NOT_APPROVED | no approval, or approval not bound to the content |
| MODEL_ARTIFACT_INCOMPATIBLE | checkpoint does not match declared architecture |
| MODEL_RUNTIME_UNAVAILABLE / MODEL_LOAD_FAILED | torch/assessor missing, or load failed |
| MODEL_TIMEOUT / MODEL_BUSY | per-image limit hit / pending cap full |
| MODEL_INFERENCE_FAILED / MODEL_RESULT_INVALID | scorer error / output failed sanitising |

## Request path
Async upload routes (`citizen.py`, `workflow.py`, `operations.py`) call `assess_image_async`, which never raises and
runs inference on one bounded worker thread (`FIRE_EVIDENCE_TIMEOUT_S`, `FIRE_EVIDENCE_MAX_PENDING`), so the event loop
is not blocked. The upload and its UNAVAILABLE status persist regardless. Re-upload of the same image updates the stored
assessment columns.

## Safety isolation
Assessment code writes only the image-assessment columns. It never touches incident status, Ranger dispatch, or
`human_review_*`. Human review (`PATCH .../review`) stays authoritative and requires its existing role/scope checks.
The UI shows UNAVAILABLE and pending explicitly ("not a negative result"), shows a model label only for a COMPLETED
result from an APPROVED artifact, and always labels it advisory.

## Tests
- `backend/tests/test_fire_evidence_adapter.py`: pre-flight and sanitising; tests needing the assessor skip unless
  `FIRE_EVIDENCE_TEST_ASSESSOR_REPO` (or `FIRE_EVIDENCE_REPO`) points at an assessor checkout.
- `backend/tests/test_citizen_report_route.py`: real-route, real-PostgreSQL tests for citizen report creation (ownership, idempotency, CSRF/role, no direct SQL inserts).
- `backend/tests/test_fire_evidence_routes.py`: real PostgreSQL + real app (authN/authZ, upload persistence, review and incident isolation, event-loop non-blocking).
- Fixtures in `backend/tests/fixtures/fire_evidence/` are toy bundles (`fire-assessor-fixture-0`), not the real model.
- `frontend/unit/assessmentPresentation.unit.ts`.

## Defects found in the base commit (not caused by this change)
- `POST /api/citizen/reports` returned 500 on real PostgreSQL: its `INSERT ... RETURNING` omitted `reporter_id`, which the ownership check reads. Fixed by adding it to `RETURNING` (it is still not returned to the client); regression tests in `backend/tests/test_citizen_report_route.py`.
- The image review `UPDATE` hit an ambiguous-parameter error on real PostgreSQL; fixed with `CAST(:status AS TEXT)`.
- Three backend tests already failed before these changes (see the change report).

## Not provided
The 345 MB research bundle is intentionally absent; do not copy it here. No calibration, OOD thresholds, approval, or
phone-photo evaluation exist, so the artifact remains INCOMPLETE and inference stays off.

## Development-only experimental path
See `docs/fire_evidence_experimental_inference.md`. It is a separate, default-off, development-only path; none of the production rules above are relaxed by it.
Approved artifacts additionally require an Ed25519 signature over the canonical artifact metadata, including approval identity, timestamp, scope, evidence references, key id, schema, and checkpoint binding. The trusted public key and key id are supplied independently through `FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY` and `FIRE_EVIDENCE_TRUSTED_KEY_ID`; private signing keys must remain outside the repository and artifact bucket. Missing or invalid signatures remain `UNAVAILABLE`.
