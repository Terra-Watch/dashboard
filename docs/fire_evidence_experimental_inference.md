# Fire Evidence Assessor — development-only experimental inference

**EXPERIMENTAL / NOT FOR OPERATIONAL USE.** This lets developers run the real audited checkpoint through the normal upload routes. It is not an
approved artifact and does not change the production contract in `docs/fire_evidence_artifact_contract.md` and `docs/fire_evidence_integration.md`.
`FIRE_EVIDENCE_INFERENCE_ENABLED` stays `false`; the incomplete bundle is still refused by the production path.

## Gates (all must hold, otherwise an explicit UNAVAILABLE is stored)
| Gate | If it fails |
|---|---|
| `FIRE_EVIDENCE_EXPERIMENTAL_ENABLED` is true (default off) | experimental path not considered; production behaviour exactly as before |
| `TERRAWATCH_ENV` is `development`, `dev`, `local` or `test` (unset = production) | `MODEL_EXPERIMENTAL_NOT_PERMITTED` |
| `FIRE_EVIDENCE_INFERENCE_ENABLED` is not also true | `MODEL_EXPERIMENTAL_CONFLICT` (modes are never mixed; neither runs) |
| `FIRE_EVIDENCE_REPO`, `FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT`, `FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE` set | `MODEL_EXPERIMENTAL_NOT_CONFIGURED` |
| SHA-256 of the file equals the hash **pinned in code** (`EXPERIMENTAL_ALLOWED_SHA256`), size matches, provenance names that hash and has no approval field | `MODEL_EXPERIMENTAL_INTEGRITY_FAILED` / `_PROVENANCE_INVALID` / `_NOT_FOUND` |
| tensor names, shapes and dtypes match ViT-B/16 + LoRA r8 (blocks 8-11) + 2-logit head (no pickle execution) | `MODEL_EXPERIMENTAL_INCOMPATIBLE` |
| torch/open_clip import and the model builds | `MODEL_EXPERIMENTAL_LOAD_FAILED` (also `MODEL_RUNTIME_UNAVAILABLE` if the assessor checkout is missing) |

Bad images are rejected by the assessor's validation (`EMPTY_FILE`, `UNSUPPORTED_TYPE`, `DECODE_FAILED`, `IMAGE_TOO_SMALL`, ...) before the model is called.
Non-finite or absurd logits become `MODEL_EXPERIMENTAL_INFERENCE_FAILED`. Execution uses the same single bounded worker as production:
`MODEL_TIMEOUT` / `MODEL_BUSY` on overrun.

## What is stored and shown
`resq_incident_images.assessment_status = 'EXPERIMENTAL'`, `authenticity_status = NULL`, and `assessment` JSON with `raw_logits`, `notice`,
`artifact_status = EXPERIMENTAL_UNAPPROVED`, `scores = null`, `derived_label = null`, `decision = REQUIRES_REVIEW`. Citizens never see the logits (their
responses carry only the status). Staff views show the headline "EXPERIMENTAL / NOT FOR OPERATIONAL USE", the raw logits marked uncalibrated and not
probabilities, and never a fire / no-fire label; this is decided from the row's own status, so a forged `APPROVED` inside the JSON cannot promote it.

## Isolation
No router reads model output. Incident status, assignments, alerts and Ranger dispatch are changed only by existing human-driven endpoints, and human
review stays authoritative; tests assert none of them move after an experimental assessment, even with an extreme logit.

## Enable locally
1. Get the checkpoint from the bucket (never commit it) and check `sha256sum weights.pt` = `7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa`.
2. Install the pinned runtime from the assessor: `pip install --extra-index-url https://download.pytorch.org/whl/cpu -r requirements/experimental-inference.txt`.
3. Export, in the backend's shell only: `TERRAWATCH_ENV=development FIRE_EVIDENCE_EXPERIMENTAL_ENABLED=true FIRE_EVIDENCE_REPO=<assessor checkout>
   FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT=<weights.pt> FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE=<assessor>/docs/provenance/lora_s0_provenance.json FIRE_EVIDENCE_TIMEOUT_S=120`.
4. Leave `FIRE_EVIDENCE_INFERENCE_ENABLED` unset.

## Tests
`backend/tests/test_fire_evidence_experimental.py` (adapter; toy checkpoint + stub scorer, plus 3 real-checkpoint tests gated by `FIRE_EVIDENCE_REAL_CHECKPOINT`) and
`backend/tests/test_fire_evidence_experimental_routes.py` (real app and PostgreSQL; one real-checkpoint route test). They need `FIRE_EVIDENCE_TEST_ASSESSOR_REPO`.
