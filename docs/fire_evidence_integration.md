# Fire Evidence Assessor — dashboard integration

Status: **inference disabled by default.** No complete, approved artifact exists. Every upload is persisted with
`assessment_status = UNAVAILABLE` and a structured error code. Nothing here enables operational inference.

**Product rules (enforced in code, covered by tests):** (1) authenticity, synthetic, edited and reused detection may appear on a fire-report image only as a separate ADVISORY `media_integrity` signal that never feeds any fire-report decision; (2) community media moderation has
its own artifact configuration; (3) an optional shadow mode records assessments without showing or using them. See the three sections below and "Four gates before production use".

Verified only against this repository at base commit `48789ee` (read-only clone), not against any other working tree.

## Contract (`fire-assessor-artifact/1`)
Bundle directory: `artifact.json` + `weights.pt` + `arrays.npz`. The adapter refuses unless all hold:
- `schema_version` (the key the adapter reads; an older draft of this document called it `artifact_format`) is `fire-assessor-artifact/1`, and `model_version` equals `FIRE_EVIDENCE_MODEL_VERSION`.
- Output mapping is exactly `0 -> flames_visible`, `1 -> smoke_visible`.
- Files present, and SHA-256 of `weights.pt` / `arrays.npz` match `artifact.json`.
- Derived status is `APPROVED`: approval record (approver, approved_at, scope, evidence) exists and its
  `artifact_binding_sha256` equals SHA-256 of canonical JSON (`sort_keys`, separators `(",", ":")`, ASCII) of
  `artifact.json` without `approval` and `artifact_status`. Calibration and OOD sections must be present.
- If `FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY` is set, the Ed25519 signature in `approval.signature` verifies (see "Signature verification").
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
| MODEL_ARTIFACT_SIGNATURE_INVALID | `FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY` is set and the signature is missing, forged, stale, for another key id, or `cryptography` is not installed |
| MODEL_ARTIFACT_INCOMPATIBLE | checkpoint does not match declared architecture |
| MODEL_RUNTIME_UNAVAILABLE / MODEL_LOAD_FAILED | torch/assessor missing, or load failed |
| MODEL_TIMEOUT / MODEL_BUSY | per-image limit hit / pending cap full |
| MODEL_INFERENCE_FAILED / MODEL_RESULT_INVALID | scorer error / output failed sanitising |

## Signature verification (optional, off unless a key is configured)
The previous revision of this document said approved artifacts "require" an Ed25519 signature. **That was not true of the code**: the variables
were documented but never read. Now:
- `FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY` unset (the default): the signature is **not checked**. The content-digest approval binding above is still enforced,
  but anyone who can write the artifact directory could rewrite the approval record and re-bind it. Treat the artifact directory as trusted storage.
- `FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY` set (base64 of the raw 32-byte Ed25519 public key): the bundle must carry `approval.signature = {algorithm: "Ed25519", key_id, value}`
  (base64) and the signature must verify over the **signing payload**: the canonical JSON (sorted keys, separators `(",", ":")`, ASCII) of the whole `artifact.json` with only
  `approval.signature` removed. That covers the file hashes, calibration, the approval record, `artifact_status` and `approval.binding_sha256`.
  If `FIRE_EVIDENCE_TRUSTED_KEY_ID` is also set, `signature.key_id` must equal it. Any failure (including the `cryptography` package missing) is `MODEL_ARTIFACT_SIGNATURE_INVALID`.
- The check runs last in the stdlib pre-flight, so a bundle that is incomplete or unapproved still reports the more specific code. The assessor's own loader does not verify signatures
  (the inspected assessor checkout, HEAD `7ddb717`, has no signing module), so the website adapter is the only place this is enforced.
- The trusted key must come from outside the artifact bucket; the private key never belongs in this repository. The test fixture key is a throwaway.

## Staff-facing assessment contract
`GET /api/incidents/{id}` (`images[].assessment`), the upload response and the review response all use the same typed object, produced by `image_assessment.present_assessment`.
Stored rows from earlier versions are re-presented in this shape (the whitelist is re-applied on read; unknown stored keys are dropped; unreadable rows become UNAVAILABLE).

```jsonc
{
  "assessment_status": "COMPLETED" | "UNAVAILABLE" | "EXPERIMENTAL" | "SHADOW" | "PENDING",
  "artifact_status": "APPROVED" | "EXPERIMENTAL_UNAPPROVED" | null,
  "model_version": "...", "error_code": null | "MODEL_...",
  "scores": { "flames_visible": 0..1, "smoke_visible": 0..1 } | null,   // calibrated probabilities from an APPROVED artifact, otherwise null
  "derived_label": "ACTIVE_FIRE" | "SMOKE_ONLY" | "NO_VISIBLE_FIRE" | "UNCERTAIN" | null,
  "decision": "REQUIRES_REVIEW",           // the only decision the model can express
  "review_required": true,                  // always true for COMPLETED, UNAVAILABLE and EXPERIMENTAL
  "review_priority": "HIGH" | "STANDARD",
  "quality_flags": ["TOO_DARK", ...],
  "ood_flag": true | false | null,          // null (not false) when nothing was assessed
  "authenticity": { "status": "NO_CONCERNS_FOUND"|"POSSIBLE_SYNTHETIC"|"POSSIBLE_EDITED"|"REUSED"|"INCONSISTENT"|"INCONCLUSIVE"|"NOT_ASSESSED", "signals": [] },   // NOT_ASSESSED unless exposed, see below
  "indications": { "synthetic": I, "edited": I, "reused": I },      // I = "NOT_ASSESSED" | "NONE_FOUND" | "POSSIBLE"
  "media_integrity": { "status": M, "note": "...", "advisory": true, "affects_incident": false },
      // M = NO_CONCERN_DETECTED | POSSIBLE_SYNTHETIC | POSSIBLE_EDITED | POSSIBLE_REUSED | INCONCLUSIVE | NOT_ASSESSED | UNAVAILABLE
  "limitations": ["..."]
}
```
EXPERIMENTAL additionally carries `raw_logits`, `scores_calibrated: false`, `checkpoint_sha256`, `notice`; `scores` and `derived_label` stay null.

**UNAVAILABLE never looks like a negative result:** `scores`, `derived_label`, `artifact_status` and `ood_flag` are null, `authenticity.status` is `NOT_ASSESSED` (previously
`INCONCLUSIVE`, which could be read as "checked, nothing found"), every indication is `NOT_ASSESSED`, and `review_required` is true.

### Media integrity on fire-report images (advisory, flag default off)
`media_integrity` is decided in ONE function, `image_assessment.media_integrity_for`, from the assessment status and the authenticity component only:

| Assessment | `media_integrity.status` |
|---|---|
| `UNAVAILABLE` / any error | `UNAVAILABLE` (never clean) |
| `PENDING`, `EXPERIMENTAL`, `SHADOW`, missing or unreadable stored data | `NOT_ASSESSED` |
| `COMPLETED` + `APPROVED`, flag off OR the artifact's authenticity component is not `PROVIDED` | `NOT_ASSESSED` ("no approved authenticity component") |
| `COMPLETED` + `APPROVED`, flag on and component provided: `NO_CONCERNS_FOUND` / `POSSIBLE_SYNTHETIC` / `POSSIBLE_EDITED` / `REUSED` / `INCONSISTENT` / `INCONCLUSIVE` / `NOT_ASSESSED` | `NO_CONCERN_DETECTED` / `POSSIBLE_SYNTHETIC` / `POSSIBLE_EDITED` / `POSSIBLE_REUSED` / `POSSIBLE_EDITED` (note about the inconsistency) / `INCONCLUSIVE` / `NOT_ASSESSED` |

`FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED` (exactly `true` to enable; default off). The authenticity research head must not be used operationally; the flag only exposes an authenticity component that an
APPROVED artifact already contains and never turns anything on in a model. With the flag off, `authenticity`/`indications` are `NOT_ASSESSED` too, so the three keys stay consistent. Every note says the
result is advisory, does not verify or reject the report and does not change priority, status, dispatch or visibility; `NO_CONCERN_DETECTED` adds that it is not proof the photo is a true record of the scene.
The fire/smoke fields (scores, label, decision, priority, quality flags, OOD) are computed from the validated model output alone and are identical whatever the authenticity result (tests).
Nothing reads `media_integrity` or `authenticity` to change incident status, priority, assignment, dispatch, alerts, notifications, public visibility, filtering or ordering (an AST test scans the application).
`resq_incident_images.authenticity_status` stores the mapped status only for COMPLETED + APPROVED results whose authenticity was exposed, otherwise NULL, and is shown only while the flag is on.
Staff incident list rows carry the display-only `image_media_integrity_status` (latest image's status, `null` without an image); it is never used in WHERE/ORDER BY/GROUP BY. Citizen, ranger and public
responses never carry any of it. The human review values (`VERIFIED_AUTHENTIC`, `POTENTIALLY_SYNTHETIC`) are a person's judgement and unaffected.

**Indications** (`image_assessment.indications_for`). The assessor collapses several concerns into one status by priority (REUSED > POSSIBLE_SYNTHETIC > POSSIBLE_EDITED > INCONSISTENT) but its
signals list every concern that fired, so both are read:

| Input | synthetic | edited | reused |
|---|---|---|---|
| `POSSIBLE_SYNTHETIC` or signals `IPTC_DIGITAL_SOURCE_ALGORITHMIC`, `GENERATOR_TAG_IN_METADATA`, `LEARNED_SYNTHETIC_SCORE:*` | POSSIBLE | | |
| `POSSIBLE_EDITED` or signal `LEARNED_EDITED_SCORE:*` | | POSSIBLE | |
| `INCONSISTENT` or signals `EXIF_CAPTURE_AFTER_UPLOAD`, `EXIF_GPS_FAR_FROM_REPORTED_LOCATION` | | POSSIBLE (+ limitation note: may have an innocent explanation) | |
| `REUSED` or signal `REUSED_MATCHES:*` | | | POSSIBLE |
| `NO_CONCERNS_FOUND` | NONE_FOUND | NONE_FOUND | **NOT_ASSESSED** |
| `INCONCLUSIVE`, `NOT_ASSESSED` | NOT_ASSESSED | NOT_ASSESSED | NOT_ASSESSED |

Cells left blank are `NOT_ASSESSED` unless another row makes them POSSIBLE; a concern that did not fire next to one that did is not reported as `NONE_FOUND`, because a conclusive negative was not
established. `reused` can only be `NONE_FOUND` when `image_assessment.REUSE_CHECK_ACTIVE` is true: the website builds the assessor without a reuse index, so reuse is never checked today and
`NO_CONCERNS_FOUND` must not be read as "not reused". Weak signals (`EDITING_SOFTWARE_TAG`, `C2PA_MANIFEST_PRESENT_UNVERIFIED`, `EXIF_CAPTURE_OLD`) never change an indication. `REUSED_MATCHES:*` signals are
reduced to the bare token so other images' ids never reach the response.

**Citizen and ranger responses stay minimal:** `assessment_status` only. No scores, labels, indications or signals are ever returned to a citizen.

**No action from model output:** routers only persist (`persistence_fields`) and present (`present_assessment`). A test scans the routers and fails if one reads `scores`, `derived_label`, `COMPLETED`, etc., and a DB
test runs the production path with a fake model returning the most extreme fire result and asserts that incident status, assignments, alerts, notices and verifications do not change.

## CSRF
`POST /api/incidents/{id}/images` now has the same double-submit CSRF dependency (`resq_csrf` cookie + `x-resq-csrf` header) as the citizen, ranger and community upload routes. It was previously the one
upload route without it. API clients using only a bearer token must send the pair (the web app's request helper already does). `PATCH .../review` is unchanged.

## Community media moderation (separate policy, default off)
Not part of the fire incident workflow. Module `backend/app/services/community_image_assessment.py`; tables `resq_community_post_images` and `resq_community_image_assessments`
(idempotent, created by `schemas_ext/community_images.py`); routes in `routers/community.py`. It never touches `resq_incident_images`, and creates no incident, alert, assignment or staff notification.

| Flag (default off) | Effect |
|---|---|
| `COMMUNITY_IMAGES_ENABLED` | `POST /api/community/posts/{id}/image` (author only, CSRF, one image per post, jpeg/png/webp, `COMMUNITY_IMAGE_MAX_BYTES` default 5 MB, max 25 MP, single frame, must decode and match the declared type) and `GET .../image`. With it off both return 404 and no `image` keys appear anywhere. |
| `FIRE_EVIDENCE_COMMUNITY_ENABLED` | Also runs the authenticity check on the upload (only effective with the flag above). It needs its OWN artifact configuration (below); if that is not configured the result is UNAVAILABLE and the post is held. |

**Own artifact configuration (config name `community`).** `FIRE_EVIDENCE_COMMUNITY_ARTIFACT_DIR` and `FIRE_EVIDENCE_COMMUNITY_MODEL_VERSION` (default `fire-assessor-v1.0.0`) select the artifact the
community path loads, so a community deployment can point at an authenticity-capable artifact while fire reports point at the fire artifact. If `FIRE_EVIDENCE_COMMUNITY_ARTIFACT_DIR` is unset the
community path is `UNAVAILABLE` / `MODEL_ARTIFACT_NOT_CONFIGURED` and holds posts for a moderator; it never falls back to `FIRE_EVIDENCE_ARTIFACT_DIR`. Shared: the assessor code checkout
`FIRE_EVIDENCE_REPO`, the master switch `FIRE_EVIDENCE_INFERENCE_ENABLED`, the optional trusted key, timeout and pending cap. Both configurations run the same fail-closed checks (schema, version pin,
file hashes, checkpoint hash, output mapping, completeness, approval bound to the content digest, optional Ed25519 signature) and each is approved separately: they are different artifacts with different
digests, so approving one never approves the other. An artifact whose authenticity component is `EXCLUDED_BY_POLICY` gives `NOT_ASSESSED`, which the community policy treats as `INCONCLUSIVE` (held).
**`FIRE_EVIDENCE_SHADOW_MODE` does not affect the community path.**

Storage: the stored copy is re-encoded from decoded pixels (EXIF, GPS, ICC and PNG text chunks are not kept; orientation is applied first) under `COMMUNITY_IMAGE_STORAGE_DIR`
(default `backend/runtime_data/community_images`) as `<post_id>/<sha256>.<ext>`; the hash is re-checked on every read. The model is run on the ORIGINAL bytes, in memory only, because provenance
markers (generator tags) live in the metadata that is stripped from the stored copy.

Moderator-only result (`media_assessment` in `GET /api/community/moderation/queue`, which already requires a moderator role):
`{status, indications{synthetic,edited,reused}, quality_flags, moderator_review_recommended, advisory: true, model_version, error_code, limitations}`.
Fire/smoke scores, labels, priority, OOD flag and any dispatch-like field are never copied (the mapping reads only the authenticity verdict, quality flags, model version and error code).

| Shared model result | Community status |
|---|---|
| COMPLETED, `NO_CONCERNS_FOUND` | `AUTHENTIC_NO_CONCERN` (means "no concern found", not "verified authentic") |
| COMPLETED, `NO_CONCERNS_FOUND`, with `TOO_SMALL`, `NEAR_UNIFORM` or `EXTREME_BLUR` | `INCONCLUSIVE` |
| `POSSIBLE_SYNTHETIC` | `POSSIBLE_SYNTHETIC` |
| `POSSIBLE_EDITED`, `INCONSISTENT` | `POSSIBLE_EDITED` (INCONSISTENT adds a limitation note) |
| `REUSED` | `REUSED` |
| `INCONCLUSIVE`, `NOT_ASSESSED`, unknown | `INCONCLUSIVE` |
| UNAVAILABLE, EXPERIMENTAL, malformed, adapter exception | `UNAVAILABLE` |

Policy: every status except `AUTHENTIC_NO_CONCERN` (UNAVAILABLE included) holds the post through the existing auto-hold mechanism (`status='held'` plus an open report with no reporter and the reason
`auto: media <status>`). A human moderator approves or removes it; the decision is recorded on the assessment row. Nothing is auto-published as verified, auto-removed or auto-muted, and a clean result never releases a
post that was held for another reason. Authors see only the existing "A moderator will look at this" message; the public and authors never see signals. The held post's image is visible to its author and to
moderators only until approved. Source-scan tests prove `community.py` and the new module reference no incident, assignment, dispatch or alert code (the one pre-existing alert call, a warning to a sanctioned member, lives in the sanction route).

## Shadow mode (`FIRE_EVIDENCE_SHADOW_MODE`, default off)
Purpose: collect real-world model output next to real Control Room decisions before anyone sees a label. Active only when the flag is true AND production inference is configured and enabled
(`FIRE_EVIDENCE_INFERENCE_ENABLED`, artifact configured; not the development-only experimental path). Then, for every incident image (citizen evidence, ranger evidence, staff incident images):
- the production path runs unchanged and the FULL sanitized assessment is stored (COMPLETED or UNAVAILABLE, with the error code) with `assessment_status = 'SHADOW'` and `"shadow": true` in the JSON;
  configuration refusals (not configured / inference disabled) are not shadow rows;
- nothing is shown or used: the staff assessment is only `{assessment_status: "SHADOW", model_version, review_required: false, scores: null, derived_label: null, decision: null, error_code: null,
  ood_flag: null, quality_flags: [], authenticity/indications/media_integrity NOT_ASSESSED, limitations: ["Shadow mode: recorded for evaluation only"]}`; list endpoints and the citizen and ranger
  responses show status `SHADOW`. Rows stored in shadow mode stay hidden even if the flag is later turned off;
- no workflow changes: incident status, assignments, alerts, notices, verifications and human review are untouched (asserted by tests);
- the community path is unaffected by this flag.

Evaluate with `cd backend && python -m scripts.shadow_report --json-out shadow.json --md-out shadow.md [threshold arguments]` (read-only; SELECTs only). It compares the stored shadow assessments with
decisions people already recorded: `human_review_status`, the incident `close_reason` and ranger field-verification outcomes. It prints counts, the model-label x human-review agreement matrix,
missed fires (human positive, model `NO_VISIBLE_FIRE`), false alarms (human negative, model ACTIVE_FIRE/SMOKE_ONLY), UNCERTAIN share, HIGH-priority share, a daily review-volume estimate, the
UNAVAILABLE rate per error code and a go/no-go checklist. Thresholds are command-line arguments with no defaults (unset = `NOT_EVALUATED`, overall `INCOMPLETE`); the mapping from stored decisions to
"fire / credible" and "no fire" is printed in the report and nothing is invented. The report approves nothing.

## Four gates before production use
Inference stays off by default. Do not enable it for staff until all four are done, in this order:
1. **Policy selected** - the product rules above are the chosen policy (advisory-only media integrity; separate community artifact; human review authoritative); any change is a deliberate decision.
2. **Phone-photo evaluation reviewed** - a person has reviewed the assessor's evaluation on phone photos like those citizens and rangers send (none exists yet).
3. **Named owner approves the exact artifact** - a named person writes the approval record bound to that artifact's content digest (and signs it if a trusted key is configured). Nothing in this repository writes or signs it.
4. **Shadow mode completed against Control Room decisions** - run with `FIRE_EVIDENCE_SHADOW_MODE=true`, produce `scripts.shadow_report` with thresholds the owner chose, and the owner accepts the result.
Only then set `FIRE_EVIDENCE_SHADOW_MODE=false` to show assessments to staff.

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
- `backend/tests/test_fire_evidence_contract.py`: exact staff contract, indications mapping, UNAVAILABLE-not-negative, calibration/threshold behaviour at the adapter boundary (scores equal sigmoid(logit/T) from the artifact; label from the artifact thresholds; none unless APPROVED), optional signature verification, legacy rows.
- `backend/tests/test_fire_evidence_media_integrity.py`: the media_integrity mapping (7 states), flag/component gating, UNAVAILABLE never clean, no effect on status/assignments/alerts/public map/list ordering, citizen/ranger/public never carry it, source scans.
- `backend/tests/test_fire_evidence_policy.py`: separate community configuration (unset = UNAVAILABLE and held, never the fire artifact, both fail closed), shadow mode (persisted, hidden on every route, no workflow effect, community unaffected).
- `backend/tests/test_shadow_report.py`: `scripts/shadow_report.py` against seeded rows (read-only, agreement matrix, missed fires, thresholds only from arguments).
- `backend/tests/test_fire_evidence_isolation.py`: production path with a fake model returning an extreme result changes no incident status/assignment/alert/notice; failures never block uploads; CSRF on the incident-image route; router source scans.
- `backend/tests/test_community_media_moderation.py`: community flags, upload hardening, EXIF stripping, every status, UNAVAILABLE holding, moderator-only visibility, separation from the incident workflow, source scans.
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

## Production go-live (only after a human approves an artifact)

Nothing below is enabled by this repository. Do it in this order and stop at the first failure.

1. **Fetch a built bundle** (three files; it is NOT_APPROVED until a person adds an approval record):
   `gsutil -m cp -r gs://terrawatch-fire-ace-478304/artifacts/fire-assessor-v1.0.0-NOT_APPROVED/bundle/ /srv/fire-assessor/fire-assessor-v1.0.0/`
   and check `sha256sum -c SHA256SUMS` in that directory. Hashes and the build record are in the assessor repo,
   `docs/artifact/PROMOTION_RUNBOOK.md`.
2. **Human approval**: copy the bundle, put a completed record (template `docs/artifact/approval_record.TEMPLATE.json` in the assessor repo)
   under `approval.record` in the copy's `artifact.json`, with `artifact_binding_sha256` from
   `python -m fire_assessor.artifact_tools digest <dir>`. Then `python -m fire_assessor.artifact_tools verify <dir>` must report APPROVED.
   No tool in either repository writes this record.
3. **Configure** (production values; `TERRAWATCH_ENV` must not be a development value):
   ```
   TERRAWATCH_ENV=production
   FIRE_EVIDENCE_EXPERIMENTAL_ENABLED=false
   FIRE_EVIDENCE_INFERENCE_ENABLED=true
   FIRE_EVIDENCE_REPO=/srv/fire-evidence-assessor
   FIRE_EVIDENCE_ARTIFACT_DIR=/srv/fire-assessor/fire-assessor-v1.0.0-approved
   FIRE_EVIDENCE_MODEL_VERSION=fire-assessor-v1.0.0
   # FIRE_EVIDENCE_SHADOW_MODE=true   # step 5 and gate 4: record without showing
   # optional but recommended once a signing key exists:
   # FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY=<base64 raw Ed25519 public key>
   # FIRE_EVIDENCE_TRUSTED_KEY_ID=<key id>
   # community media moderation stays off unless both are set:
   # COMMUNITY_IMAGES_ENABLED=true
   # FIRE_EVIDENCE_COMMUNITY_ENABLED=true
   # FIRE_EVIDENCE_COMMUNITY_ARTIFACT_DIR=/srv/fire-assessor/<separately-approved-authenticity-artifact>
   # FIRE_EVIDENCE_COMMUNITY_MODEL_VERSION=<its model_version>
   ```
   The assessor needs `torch`, `open_clip_torch`, `pillow`, `numpy`, `pydantic` in the backend's Python (`requirements/experimental-inference.txt` in the assessor repo lists tested versions).
4. **Run**: `cd backend && DATABASE_URL=postgresql+psycopg://resq:<password>@localhost:5432/resq uvicorn app.main:app --port 8000`.
5. **Check before relying on it**: upload a test image as staff; the row must show `COMPLETED`, `artifact_status: APPROVED`, and `review_required: true`. With a not-approved or edited bundle it must show `UNAVAILABLE` with `MODEL_ARTIFACT_NOT_APPROVED` (or another `MODEL_ARTIFACT_*` code). Run in **shadow mode** first: compare assessments with Control Room decisions before anyone relies on a label.

Known facts that bear on that decision: in distribution the model is strong (test ROC-AUC flames 0.991, smoke 0.986), but on a held-out fixed-camera source smoke ROC-AUC falls to 0.707 and the false-negative rate is 29% (flames) and 52% (smoke); no phone-photo evaluation exists. A "no visible fire" label is never proof of absence. Human Control Room review remains authoritative.

## Development-only experimental path
See `docs/fire_evidence_experimental_inference.md`. It is a separate, default-off, development-only path; none of the production rules above are relaxed by it.

## Known limitations
- Signature verification is optional and off unless `FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY` is set (see above). `cryptography` is listed in `backend/requirements.txt` for it.
- Reuse of earlier images is not checked (no reuse index is passed to the assessor); `reused` is never `NONE_FOUND`.
- `NO_CONCERNS_FOUND` is not proof of authenticity and says nothing about place or time; the authenticity head's real-world accuracy is unmeasured here.
- No approved production artifact exists, so everything above has been exercised only with toy fixtures and fakes; the real-checkpoint tests remain skipped without the 345 MB file.
- Community images are not included in the citizen account-data export.
