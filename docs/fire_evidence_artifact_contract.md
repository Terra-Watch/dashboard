# Fire Evidence Assessor artifact contract

This document records the contract used by TerraWatch's fail-closed image-assessment adapter. It is an engineering contract, not approval of a model for production use.

## Required bundle

The FIRE_EVIDENCE_ARTIFACT_DIR directory must contain:

~~~text
artifact.json
arrays.npz
weights.pt
~~~

artifact.json is produced by fire_assessor.artifact.ModelArtifact.save() and must contain:

- model_version equal to FIRE_EVIDENCE_MODEL_VERSION (default fire-assessor-v1.0.0);
- calibrated thresholds for flames and smoke;
- calibrated temperatures;
- uncertainty_margin;
- OOD kind/state and cutoff metadata;
- has_auth_head and serialized authenticity-head state in arrays.npz;
- SHA-256 entries for every packaged file.

The loader verifies every declared SHA-256 before returning the artifact. The TerraWatch adapter also rejects a version mismatch, missing weights, missing configuration, import failure, or any model-construction failure. Uploads remain persisted with assessment_status=UNAVAILABLE.

## Keys the website adapter reads (stdlib pre-flight, `image_assessment.preflight_artifact`)

The pre-flight runs before any model code and returns a specific `MODEL_ARTIFACT_*` code. It reads exactly these keys of `artifact.json`; anything else is ignored:

| Key | Requirement |
|---|---|
| `schema_version` | exactly `fire-assessor-artifact/1` (this is the key name; not `artifact_format`) |
| `model_version` | equals `FIRE_EVIDENCE_MODEL_VERSION` |
| `files` | maps `weights.pt` and `arrays.npz` (no paths, no hidden names) to SHA-256 hex; the bundle may contain no undeclared file |
| `checkpoint.sha256` | equals `files["weights.pt"]` |
| `outputs` | `names == ["flames_visible","smoke_visible"]`, `label_mapping == {"0":"flames_visible","1":"smoke_visible"}` |
| `calibration`, `ood`, `authenticity` | each with an allowed `status` (`calibration: PROVIDED`; `ood: PROVIDED` with a numeric `cutoff`, or `DISABLED_BY_POLICY` with a `reason`; `authenticity: PROVIDED`, or `EXCLUDED_BY_POLICY` with a `reason`) |
| `thresholds{flames,smoke}`, `temperatures{flames,smoke}>0`, `uncertainty_margin` | numeric |
| `calibration.policy{alpha,delta}`, `calibration.source{partition:"cal", export_sha256, identity_status}` | present; `identity_status` is `PATH_PRESERVED` or `CONTENT_VERIFIED` |
| `provenance{source,initialization,training_manifest}`, `limitations`, `architecture` | present |
| `approval.record{approver,approved_at,scope,evidence[],artifact_binding_sha256}` | strings/list non-empty; `artifact_binding_sha256` equals SHA-256 of canonical JSON of `artifact.json` without `approval` and `artifact_status` |
| `approval.signature{algorithm:"Ed25519",key_id,value}` | **optional**: verified only when `FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY` is set |

`artifact_status` in the file is never trusted; the status is derived (the assessor's loader re-derives it).

### Signature (Ed25519): what is and is not enforced
`FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY` and `FIRE_EVIDENCE_TRUSTED_KEY_ID` were documented earlier as if they were required. They are enforced **only when the public key variable is set**; when it is unset the signature is
not checked at all (known limitation: the content-digest binding alone does not stop someone with write access to the artifact directory from re-approving a modified bundle). When set, the signed message is the
canonical JSON (sorted keys, separators `(",", ":")`, ASCII) of the entire `artifact.json` with `approval.signature` removed, the signature is base64 Ed25519, and `key_id` must match
`FIRE_EVIDENCE_TRUSTED_KEY_ID` if that is set. Failure is `MODEL_ARTIFACT_SIGNATURE_INVALID`. The assessor repository does not sign or verify (no signing module at HEAD `7ddb717`), so whoever approves a bundle must produce
the signature with a private key held outside this repository and the artifact bucket. See `docs/fire_evidence_integration.md`.

## Output the adapter produces from an approved artifact

Calibrated probabilities only: `scores.flames_visible/smoke_visible = sigmoid(logit / temperature)` using the artifact's temperatures, each within [0, 1] (anything else, including raw logits, is rejected as
`MODEL_RESULT_INVALID`). `derived_label` is the assessor's policy outcome from the artifact's thresholds and uncertainty margin (`ACTIVE_FIRE`, `SMOKE_ONLY`, `NO_VISIBLE_FIRE`, `UNCERTAIN`), the decision is always
`REQUIRES_REVIEW`, and `review_required` is always true. Scores, label and priority are absent unless the artifact is `APPROVED`. Authenticity is reported as `NOT_ASSESSED` when the artifact excludes it by policy.
The full staff-facing JSON, the `indications` mapping and the UNAVAILABLE semantics are in `docs/fire_evidence_integration.md`.

## Runtime compatibility

The assessor expects the separate repository at FIRE_EVIDENCE_REPO, imported from its src directory. The model path requires:

- Python 3.10 or newer;
- NumPy, Pillow, and Pydantic;
- PyTorch 2.1 or newer;
- open_clip_torch 2.24 or newer;
- OpenCLIP ViT-B-16-quickgelu;
- rank-8 LoRA state compatible with the assessor's FireModel.

The OpenCLIP base weights must be available from controlled local/cache storage before startup. Production inference must not depend on an unreviewed runtime download. The model preprocessing is OpenCLIP's transform for this exact QuickGELU configuration; the current scorer emits two fire logits, a normalized 512-dimensional embedding, and a 768-dimensional block-8 CLS feature. The output contract is Assessment: COMPLETED or UNAVAILABLE, fire/smoke scores, an advisory derived label, REQUIRES_REVIEW, quality/OOD fields, and separate authenticity status/signals.

## GCS investigation result

The inspected bucket contains raw checkpoints such as:

~~~text
gs://terrawatch-fire-ace-478304/runs/lora_s0/weights.pt
gs://terrawatch-fire-ace-478304/runs/lora_s0/run_config.json
gs://terrawatch-fire-ace-478304/runs/lora_s0/cal.npz
~~~

The checkpoint is a valid PyTorch archive and its configuration identifies the QuickGELU backbone, OpenAI initialization setting, rank-8 LoRA, seed, and training manifest hash. The calibration export contains logits, labels, embeddings, block features, groups, and source fields.

No approved artifact.json/arrays.npz bundle exists in the inspected GCS objects. The available files do not encode the final calibrated thresholds, temperatures, OOD state, authenticity-head state, or deployment approval. Reconstructing those values would require explicit policy choices and reproducible joins across feature exports and manifests. Therefore the checkpoint is not promoted or copied into the TerraWatch runtime.

## Approved packaging procedure

Run this only after the model owner supplies the exact calibration policy, authenticity training composition, approved source hashes, and runtime dependency approval:

~~~bash
cd /path/to/fire-evidence-assessor
python -m fire_assessor.build_artifact \
  --train /approved/features/train.npz \
  --cal /approved/runs/lora_s0/cal.npz \
  --ood-out /approved/features/control_clean.npz \
  --weights /approved/runs/lora_s0/weights.pt \
  --alpha 0.05 \
  --delta 0.10 \
  --margin 0.05 \
  --out /approved/fire-assessor-v1.0.0
~~~

The train and cal files must be independent, schema-compatible exports. Training data must not be substituted for calibration data. Authenticity features must be joined to their manifests with documented labels and partitions; do not infer labels from filenames without approval.

Verify the generated bundle before configuration:

~~~bash
PYTHONPATH=src python - <<'PY'
from fire_assessor.artifact import ModelArtifact
art = ModelArtifact.load("/approved/fire-assessor-v1.0.0",
                         expected_version="fire-assessor-v1.0.0")
print(art.model_version, art.weights_path, art.metadata)
PY
~~~

Then run the model-enabled assessor tests and approved image fixtures in the same pinned environment. Only after those checks and human approval should FIRE_EVIDENCE_ARTIFACT_DIR be changed.

## Failure, replacement, and rollback

Missing, corrupt, incompatible, or unavailable model dependencies produce UNAVAILABLE; they never become a negative fire result and never change incident status. Artifact replacement is an explicit operator action: stage a new immutable directory, verify checksums and fixtures, change FIRE_EVIDENCE_ARTIFACT_DIR and the model version together, restart the service, and retain the prior directory for rollback. Do not overwrite a live bundle in place.

## Current readiness

Current status: **ARTIFACT CONVERSION BLOCKED**. The local adapter and research checkpoint are compatible in architecture at a preliminary level, but no verified deployable artifact, complete calibration/authenticity policy, approved runtime dependency environment, or production approval is available.

## Reproducible preparation path

The assessor repository now provides the implementation boundary for a future
approved artifact:

- `fire_assessor.train export` preserves `paths`, `partition`, manifest hash,
  source revision, backbone, and WiSE scale in every feature export.
- `fire_assessor.features` validates the complete train/calibration exporter
  schema, finite values, dimensions, binary labels, and train/calibration
  group leakage before calibration or packaging.
- `fire_assessor.build_artifact` validates unrelated OOD embeddings, requires
  an explicit authenticity label-policy document when an authenticity head is
  supplied, and records feature-export metadata in `artifact.json`.
- `fire_assessor.train --init-spec` accepts a JSON document containing
  `provider`, `model`, and a verified 64-character `weights_sha256`; the model
  and training configuration must agree. This path records the initialization
  specification without approving the unresolved historical checkpoint.

Example preparation commands, after dependencies and approved inputs are
available:

~~~bash
PYTHONPATH=src python -m fire_assessor.train export \
  --manifest /approved/manifests/dfire_train.csv \
  --root /approved/data/dfire \
  --weights /approved/runs/reproducible/weights.pt \
  --init-spec /approved/runs/reproducible/initialization.json \
  --partition train --out /approved/features/train.npz --workers 4

PYTHONPATH=src python -m fire_assessor.build_artifact \
  --train /approved/features/train.npz \
  --cal /approved/features/cal.npz \
  --ood-out /approved/features/control.npz \
  --weights /approved/runs/reproducible/weights.pt \
  --alpha 0.05 --delta 0.10 \
  --manifest-hash <approved-manifest-sha256> \
  --source-revision <approved-source-revision> \
  --initialization /approved/runs/reproducible/initialization.json \
  --out /approved/artifacts/fire-assessor-v1.0.0
~~~

These commands are preparation instructions only. No feature extraction or
artifact generation has been executed in this phase, and the TerraWatch
backend remains fail-closed until an approved artifact is configured.


See `docs/fire_evidence_integration.md` for the adapter's enforcement of this contract, error codes, and the default-off `FIRE_EVIDENCE_INFERENCE_ENABLED` flag.
