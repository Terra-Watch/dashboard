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
