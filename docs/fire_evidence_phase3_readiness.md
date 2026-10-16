# Fire Evidence Assessor Phase 3 readiness

This is a preparation report. It does not create or promote a deployable artifact.

## Checkpoint provenance

Verified from the inspected GCS object and repository snapshot:

- runs/lora_s0/weights.pt is a valid PyTorch ZIP archive with a model state containing 172 tensors.
- run_config.json declares ViT-B-16-quickgelu, OpenAI initialization, rank-8 LoRA, seed 0, and a training manifest hash.
- The current loader constructs the same FireModel, applies LoRA to blocks 9–12, and calls load_state_dict() strictly through PyTorch's default strict=True.
- The model emits two fire logits, a normalized 512-dimensional final embedding, and a 768-dimensional block-8 CLS feature.
- The extraction path uses OpenCLIP's preprocessing for the exact QuickGELU model.

Unresolved:

- The run's recorded source hash is not independently reproducible from the current local Git state.
- The declared OpenAI initialization does not prove that pretrained weights were successfully loaded during training.
- The checkpoint does not contain calibration, OOD, or authenticity-head state.

## Source data availability

The D-Fire source archive exists in GCS:

~~~text
gs://terrawatch-fire-ace-478304/raw/dfire_kaggle/zip/smoke-fire-detection-yolo.zip
size: 3,049,605,157 bytes
sha256: 65d81b602991261b47ddc71281e99108362a30336a448e1f8d21352c825c6d83
~~~

The archive is CC0 according to its recorded dataset metadata. It was not downloaded or extracted in this phase.

The available manifest has 21,527 unique image paths and 10,670 clusters. Its recommended partition_xsrc split is:

- train: 9,169
- validation: 1,310
- calibration: 1,310
- test: 1,310
- held-out AoF source: 8,428

The configured manifest hash c04b4b2f551957d759468cfa699cad827c394189bd65a65164d475b346dd2789 is reproducible: it is the assessor manifest hash after mapping the available manifest's partition_xsrc column into the training code's partition column. This recovers the likely dfire_train.csv view used by the run. The raw report hash is different because it represents the unmodified manifest schema.

## Feature-bank plan

Do not use the frozen-base features/dfire_clean.npz as a LoRA OOD bank. It was produced with lora_blocks=[].

After source and runtime approval, obtain the D-Fire archive, verify its SHA-256, reconstruct the approved manifest, and run the existing exporter:

~~~bash
cd /path/to/fire-evidence-assessor
PYTHONPATH=src python -m fire_assessor.train export \
  --manifest /approved/manifests/dfire_train.csv \
  --root /approved/data/dfire \
  --weights /approved/runs/lora_s0/weights.pt \
  --partition train \
  --out /approved/features/lora_s0_train.npz \
  --workers 4
~~~

The output must contain finite arrays with schema:

~~~text
logits: (N, 2)
emb:    (N, 512)
block:  (N, 768)
y:      (N, 2)
groups: (N,)
source: (N,)
~~~

Before using it, validate checkpoint SHA-256, row/sample-ID preservation, duplicate paths, cluster leakage, finite values, dimensions, and manifest/code hashes. The exporter should be extended or wrapped with those checks before a production feature bank is accepted.

The repository now includes a read-only pre-extraction verifier at scripts/verify_fire_evidence_inputs.py. It validates the checkpoint archive, checkpoint SHA-256, model configuration, source hash, manifest schema/hash candidates, cluster leakage, and calibration NPZ dimensions without downloading images or writing an artifact.

## Calibration independence

The existing cal.npz has the expected tensor shapes and exactly matches the recovered xsrc calibration partition's sample count, source counts, and label counts. It contains no sample paths, so exact row identity cannot be proven from the export alone. It can be treated as partition-compatible, not fully provenance-complete, until the original export log or path-preserving manifest is recovered. Independence still requires confirming that:

1. calibration samples were not used for model parameter fitting;
2. calibration was not used to select the final checkpoint;
3. thresholds were not selected using test or held-out-source data;
4. preprocessing and checkpoint hashes match.

The val.npz and test.npz files must not be substituted for calibration.

## OOD protocol

Use three disjoint roles:

1. LoRA training partition: fit the kNN OOD bank.
2. In-domain calibration partition: select the 95th-percentile in-domain cutoff.
3. Independent control/OOD partition: evaluate AUROC and enable the detector only if it meets the configured minimum.

features/control_clean.npz is a candidate independent evaluation export, but its source and feature-model provenance must be verified. It must not be used to fit the bank or select the cutoff.

If independent OOD evaluation fails, the artifact must ship with OOD disabled and that decision recorded.

## Phase 3 continuation: provenance recovery decision

The checkpoint provenance investigation was completed without downloading or
extracting the D-Fire archive. The following evidence is now established:

- `runs/lora_s0/run_config.json` records
  `git_commit=srchash:c535f0ae41041492` and the manifest hash
  `c04b4b2f551957d759468cfa699cad827c394189bd65a65164d475b346dd2789`.
- The current fire-assessor source and the archived repository snapshot are
  byte-identical for `src/fire_assessor/*.py` and both produce
  `srchash:8f5b2bd60decd042` under the repository's fallback source-hash
  convention. The recorded `c535f0ae41041492` token was not found in the
  local repository, Git objects, branches, tags, reflog, or archived snapshot.
- The original `dfire_train.csv` file was not recovered. A compatible manifest
  view was recovered: remapping the available manifest's
  `partition_xsrc` column to the training exporter's `partition` field
  reproduces the recorded manifest hash exactly. The unmodified manifest has
  a different hash because it retains both partition columns.
- The checkpoint is a valid PyTorch archive with the expected QuickGELU
  backbone, rank-8 LoRA configuration, fire head, and full model state needed
  for strict loading. The training configuration says `pretrained=openai`,
  and the training code does not swallow model-construction errors, which is
  evidence that the requested initialization path ran. It is not proof that
  the intended OpenAI base weights were actually retrieved or which exact
  base-weight bytes were used: no base-weight hash, cache manifest, or
  training log was preserved.
- Training and inference construction are compatible at the code/configuration
  level: training builds `ViT-B-16-quickgelu` with OpenAI initialization and
  LoRA rank 8, while checkpoint loading constructs the same architecture with
  `pretrained=None` and strictly loads the saved state. Numerical equivalence
  across environments remains unverified because the approved runtime has not
  been assembled and no feature extraction was run.
- `cal.npz` is shape-, label-, source-, and count-compatible with the recovered
  calibration partition. It contains no paths or stable sample IDs, so exact
  row identity and independence from training/checkpoint selection cannot be
  established. It is therefore compatible for investigation, not yet
  provenance-complete for promotion.

The safe status is **PROVENANCE_PARTIALLY_RECOVERED**. The manifest view,
checkpoint bytes, model configuration, exporter schema, and runtime loading
contract are sufficiently identified for continued review. The missing source
revision and base-initialization evidence remain approval blockers. A model
owner must decide whether to accept that uncertainty or require recovery of
the original source tarball/commit, OpenAI base-weight provenance, and
path-preserving calibration metadata. Feature extraction remains intentionally
deferred.

The read-only verification command used for these conclusions is:

~~~bash
cd /path/to/fire-evidence-assessor
PYTHONPATH=src python scripts/verify_fire_evidence_inputs.py \
  --checkpoint /path/to/weights.pt \
  --run-config /path/to/run_config.json \
  --manifest /path/to/dfire_manifest.csv \
  --calibration /path/to/cal.npz \
  --expected-checkpoint-sha256 7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa
~~~

It passed structural, checkpoint, manifest-hash, split-leakage, and
calibration checks when no source directory was asserted, and failed closed
with the single expected source-hash mismatch when the current source
directory was supplied. No production behavior was changed by this verifier.

## Authenticity policy gates

The edit manifest defines:

- label 0: originals and benign edits;
- label 1: meaningful edits/composites;
- train/val/calibration/test partitions;
- cover_region as a held-out edit type.

The synthetic manifest defines real versus synthetic examples, with SD 1.5/SDXL used for training partitions and PixArt/Kolors held out. These assets are suitable for a future study, not automatic production-head training.

The model owner must approve:

- block-8 versus final-layer representation;
- exact train/validation/calibration/test composition;
- threshold policy and false-flag target;
- treatment of synthetic versus edited labels;
- source-overlap and duplicate exclusions.

The authenticity head remains advisory and cannot establish genuineness, recency, location, or capture time.

## Runtime specification

The separate assessor environment requires Python 3.10+, PyTorch 2.1+, open_clip_torch >= 2.24, NumPy, Pillow, and Pydantic. No packages were installed. No model weights were downloaded dynamically.

The existing model path is the reproducible starting point because it calls build_model(..., pretrained=None) when loading the fine-tuned checkpoint. OpenCLIP is still required for architecture construction and preprocessing. Runtime packaging must pin versions and provide controlled local model/cache state before service startup.

## Readiness decision

**BLOCKED_ON_CHECKPOINT_PROVENANCE**

The training manifest view is recovered and hash-compatible. The remaining primary blocker is that the checkpoint source revision srchash:c535f0ae41041492 cannot be recovered from the snapshot/current source (current source hash srchash:8f5b2bd60decd042), and pretrained OpenAI initialization is not independently established. The LoRA training feature bank has not been regenerated, calibration row identity is incomplete, and authenticity representation/label policy remains an explicit model-owner decision.

No deployable artifact was generated, no production configuration was changed, and the TerraWatch adapter remains fail-closed.
