# TerraWatch Fire Evidence Assessor Integration Status

**Date:** 2026-10-16
**Status:** LOCAL EXPERIMENTAL INFRASTRUCTURE COMPLETE - BLOCKED ON CHECKPOINT DOWNLOAD

## Addendum 2026-10-18 (productionise: staff contract, CSRF, community moderation)

Verified by running the backend suite against a local PostgreSQL 16 with the assessor checkout supplied as `FIRE_EVIDENCE_TEST_ASSESSOR_REPO`
(toy fixtures and stub scorers only; no real checkpoint, no torch): see `docs/fire_evidence_integration.md` for the staff assessment contract, the optional
signature check, the default-off community media moderation flags, and the known limitations. Nothing in this addendum enables inference anywhere; all flags default off.

## Executive Summary

All code, tests, and infrastructure for local experimental inference are in place and verified working. The integration is blocked solely by OS sandbox restrictions preventing GCP checkpoint download. Once the genuine checkpoint is available locally, the system is ready to run end-to-end.

---

## A. Checkpoint Status

### Expected Checkpoint
- **Path (configured):** `/Users/kireeti/Desktop/Projects/fire-evidence-assessor/checkpoint/weights.pt`
- **Expected SHA-256:** `7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa`
- **Expected size:** 345,237,991 bytes (345 MB)
- **Source:** `gs://terrawatch-fire-ace-478304/runs/lora_s0/weights.pt`

### Current Status
**❌ NOT PRESENT LOCALLY**

**Blocker:** OS sandbox blocks all gcloud/gsutil operations:
```
PermissionError: [Errno 1] Operation not permitted: 
'/Users/kireeti/.config/gcloud/active_config'
```

### What Exists
- ✅ Provenance file created: `docs/provenance/lora_s0_provenance.json`
- ✅ Provenance validation: Passes all checks
- ✅ Checkpoint directory structure: Created at `checkpoint/`
- ✅ .gitignore: Prevents accidental checkpoint commits

### Next Steps
**User must download the checkpoint manually outside the sandbox:**
```bash
# Outside Kiro IDE
gsutil cp gs://terrawatch-fire-ace-478304/runs/lora_s0/weights.pt \
  ~/Desktop/Projects/fire-evidence-assessor/checkpoint/weights.pt

# Verify the digest
shasum -a 256 ~/Desktop/Projects/fire-evidence-assessor/checkpoint/weights.pt
# Must output: 7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa
```

---

## B. Code Infrastructure

### Fire Evidence Assessor Repository
**Branch:** `claude/wizardly-turing-qzfyiy`
**Commit:** `8965c965f126f2a1d4b21a27677a42e278fb3a79`

**Implementation Status:**
- ✅ `src/fire_assessor/experimental.py` - Complete experimental inference module
- ✅ `src/fire_assessor/checkpoint.py` - SHA-256 + architecture verification (no pickle execution)
- ✅ `src/fire_assessor/model.py` - FireModel (ViT-B/16 + LoRA r8)
- ✅ `src/fire_assessor/features.py` - Image preprocessing
- ⚠️ `src/fire_assessor/json_security.py` and `src/fire_assessor/signing.py` - listed here earlier but NOT present in the assessor checkout inspected on 2026-10-18 (branch `claude/wizardly-turing-qzfyiy`, HEAD `7ddb717`); the website adapter now does its own optional Ed25519 verification (`FIRE_EVIDENCE_TRUSTED_PUBLIC_KEY`)
- ✅ `docs/provenance/lora_s0_provenance.json` - Provenance record (newly created)
- ✅ `docs/integration/EXPERIMENTAL_INFERENCE.md` - Documentation
- ✅ `scripts/experimental_smoke.py` - Standalone smoke test script
- ✅ `checkpoint/` - Directory for downloaded checkpoints

**Architecture Verification:** ✅
- OpenCLIP ViT-B-16-quickgelu base
- LoRA rank 8 on blocks 8-11
- 2-output logits head (flames_visible, smoke_visible)
- Checkpoint format validated without pickle execution

**Test Coverage:**
```bash
cd ~/Desktop/Projects/fire-evidence-assessor
FIRE_EVIDENCE_REAL_CHECKPOINT=/path/to/weights.pt \
  python -m pytest tests/test_experimental.py -v
```
- ✅ 22 passed (mock checkpoint tests)
- 🔒 1 skipped (requires real checkpoint: `test_real_checkpoint_*`)
- 2 deselected (other tests)

### TerraWatch Backend
**Branch:** `main`
**Commit:** `b151a5932cccce2bc5a064f399c7d543c23e1e3e`

**Implementation Status:**
- ✅ `backend/app/services/image_assessment.py` - Fail-closed adapter with experimental path
- ✅ Pinned checkpoint SHA-256: `EXPERIMENTAL_ALLOWED_SHA256 = "7bd549..."`
- ✅ Configuration gates: TERRAWATCH_ENV, flags, path validation
- ✅ Worker pool: Single bounded worker, timeout, pending cap
- ✅ Result sanitization: Enforces experimental contract
- ✅ `.env` configured for experimental inference
- ✅ `docs/fire_evidence_experimental_inference.md` - Integration documentation
- ✅ `backend/tests/__init__.py` - Test package marker (newly created)

**Configuration (backend/.env):**
```env
TERRAWATCH_ENV=development
FIRE_EVIDENCE_EXPERIMENTAL_ENABLED=true
FIRE_EVIDENCE_REPO=/Users/kireeti/Desktop/Projects/fire-evidence-assessor
FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT=/Users/kireeti/Desktop/Projects/fire-evidence-assessor/checkpoint/weights.pt
FIRE_EVIDENCE_EXPERIMENTAL_PROVENANCE=/Users/kireeti/Desktop/Projects/fire-evidence-assessor/docs/provenance/lora_s0_provenance.json
FIRE_EVIDENCE_TIMEOUT_S=120
FIRE_EVIDENCE_INFERENCE_ENABLED=false  # Production path disabled
```

**Test Coverage:**
```bash
cd ~/Desktop/Projects/RESQ/website/backend
FIRE_EVIDENCE_TEST_ASSESSOR_REPO=/Users/kireeti/Desktop/Projects/fire-evidence-assessor \
  python -m pytest tests/test_fire_evidence_experimental.py -v
```
- ✅ 63 passed (adapter logic, configuration gates, sanitization, error handling)
- 🔒 3 skipped (require real checkpoint)

**Test Categories Verified:**
- Configuration gate enforcement (development vs production)
- Flag conflict detection (experimental + production = refuse both)
- Provenance validation (SHA-256, size, approval rejection)
- Architecture compatibility checking
- Invalid image rejection (empty, malformed, too small)
- Non-finite logit rejection (NaN, Inf, absurd values)
- Scorer exception containment
- Result sanitization (drops forged fields, enforces experimental contract)
- Timeout and worker pool behavior
- Production path isolation (stays disabled during experimental)

---

## C. Verified Integration Points

### Configuration Logic ✅
```python
# Tested in isolation
development_environment() → True  (TERRAWATCH_ENV=development)
experimental_requested() → True   (FIRE_EVIDENCE_EXPERIMENTAL_ENABLED=true)
inference_enabled() → False       (FIRE_EVIDENCE_INFERENCE_ENABLED=false)
configuration_error() → None      (all checks pass)
```

### Provenance Loading ✅
```python
# Verified against created file
load_provenance(provenance_path, expected_sha256="7bd549...")
→ record_version: 1
→ checkpoint.sha256: 7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa
→ checkpoint.size_bytes: 345237991
→ No approval fields (correctly rejected if present)
```

### Module Imports ✅
```python
# Fire Evidence Assessor
from fire_assessor import experimental
from fire_assessor.model import TorchScorer
from fire_assessor.checkpoint import inspect_checkpoint_bytes

# TerraWatch Backend  
from app.services import image_assessment
```

### Test Fixtures ✅
- Mock checkpoints exist for unit tests (21 KB toy files)
- Real checkpoint slot prepared: `checkpoint/weights.pt`
- Provenance file created and validated
- Test helper functions work (`jpeg_bytes`, `make_stub_scorer`)

---

## D. NOT TESTED (Requires Real Checkpoint)

The following cannot be verified without the 345 MB checkpoint:

### Assessor Repository Tests
- `test_real_checkpoint_loads_and_architecture_matches`
- `test_real_checkpoint_inference_returns_finite_logits` 
- `test_real_checkpoint_deterministic_across_runs`

### TerraWatch Backend Tests
- `test_real_checkpoint_end_to_end`
- `test_real_checkpoint_through_routes`
- Full upload → inference → persistence → frontend workflow

### Runtime Verification
- Actual checkpoint loading (6-7 seconds reported)
- Real model inference (130 ms median reported)
- Memory usage (1.03 GB peak reported)
- OpenCLIP import and initialization
- torch + open_clip_torch dependencies

### Integration Workflow
1. ❌ Backend starts with real checkpoint loaded
2. ❌ Frontend connects to backend
3. ❌ Upload image through UI
4. ❌ Genuine inference executes
5. ❌ Assessment persists to database
6. ❌ Result renders in frontend
7. ❌ Human review flow verified
8. ⚠️ Incident status unchanged after assessment - verified with a FAKE model returning an extreme COMPLETED result (`backend/tests/test_fire_evidence_isolation.py`); not verified with the real checkpoint

---

## E. Files Changed

### Fire Evidence Assessor
**New Files:**
- `docs/provenance/lora_s0_provenance.json` - Provenance record for seed 0
- `checkpoint/README.md` - Checkpoint download instructions
- `checkpoint/.gitignore` - Prevents accidental commits

**Modified Files:**
- None (all experimental code already present from previous work)

### TerraWatch Backend
**New Files:**
- `backend/tests/__init__.py` - Test package marker

**Modified Files:**
- `backend/.env` - Added experimental configuration

---

## F. Remaining Blockers

### Local Development (This Mac)
**CRITICAL:** Checkpoint download blocked by OS sandbox
- **Impact:** Cannot run genuine inference
- **Workaround:** User must download outside Kiro IDE
- **Resolution:** Download manually, verify SHA-256, retry integration

### Production Approval (Documented, Not Blocking Local Dev)
- No approved calibration or OOD configuration
- No deployment-like phone photograph evaluation
- Training environment not fully recorded
- Training-time source revision not retrievable  
- Licensing of data and pretrained weights unresolved
- No human approval record
- False-negative rates under shift: 29% flames / 52% smoke

**These do NOT block local experimental inference.** They block production deployment only.

---

## G. Run Instructions

### Prerequisites
1. **Download checkpoint (OUTSIDE Kiro IDE):**
   ```bash
   gsutil cp gs://terrawatch-fire-ace-478304/runs/lora_s0/weights.pt \
     ~/Desktop/Projects/fire-evidence-assessor/checkpoint/weights.pt
   
   # MUST verify:
   shasum -a 256 ~/Desktop/Projects/fire-evidence-assessor/checkpoint/weights.pt
   # Expected: 7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa
   ```

2. **Install experimental runtime (backend venv):**
   ```bash
   cd ~/Desktop/Projects/RESQ/website/backend
   source .venv/bin/activate  # or your venv
   pip install --extra-index-url https://download.pytorch.org/whl/cpu \
     -r ~/Desktop/Projects/fire-evidence-assessor/requirements/experimental-inference.txt
   ```

### Start Backend
```bash
cd ~/Desktop/Projects/RESQ/website/backend
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

**Expected on startup:**
- First request: ~7s model load (345 MB checkpoint)
- Subsequent requests: ~130 ms inference (CPU)
- Logs: "experimental fire evidence path" status

### Start Frontend
```bash
cd ~/Desktop/Projects/RESQ/website/frontend
npm run dev
```

**Opens:** `http://localhost:5173`

### Verify Integration
1. Navigate to Operations → Incidents
2. Open an existing incident or create a test incident
3. Upload an image (any JPEG/PNG, >160x120)
4. **Expected result:**
   - `assessment_status: "EXPERIMENTAL"`
   - `artifact_status: "EXPERIMENTAL_UNAPPROVED"`
   - `raw_logits: {flames_visible: X.XX, smoke_visible: Y.YY}`
   - `notice: "EXPERIMENTAL / NOT FOR OPERATIONAL USE"`
   - `decision: "REQUIRES_REVIEW"`
   - No authenticity_status (NULL)
   - Incident status UNCHANGED

### Run Tests
```bash
# Assessor (with real checkpoint)
cd ~/Desktop/Projects/fire-evidence-assessor
FIRE_EVIDENCE_REAL_CHECKPOINT=checkpoint/weights.pt \
  python -m pytest tests/test_experimental.py -v

# Backend (with real checkpoint)
cd ~/Desktop/Projects/RESQ/website/backend
FIRE_EVIDENCE_TEST_ASSESSOR_REPO=~/Desktop/Projects/fire-evidence-assessor \
FIRE_EVIDENCE_REAL_CHECKPOINT=~/Desktop/Projects/fire-evidence-assessor/checkpoint/weights.pt \
  python -m pytest tests/test_fire_evidence_experimental.py -v
```

---

## H. Safety Confirmation

### No Destructive Operations ✅
- ❌ No commits made
- ❌ No pushes executed
- ❌ No git reset/clean/stash
- ❌ No branch switches
- ❌ No dependency upgrades
- ❌ No GCP resource modifications
- ❌ No IAM changes
- ❌ No bucket uploads

### Production Inference Disabled ✅
- `FIRE_EVIDENCE_INFERENCE_ENABLED=false` (unchanged)
- Production artifact path not configured
- Approval signature verification unused by experimental path
- Experimental path explicitly separate from production contract

### Workspace State Preserved ✅
- All existing modified files preserved
- All untracked files preserved
- Fire Evidence Assessor: branch `claude/wizardly-turing-qzfyiy` (unchanged)
- TerraWatch: branch `main` (unchanged)

---

## I. What Was Accomplished

1. ✅ **Provenance file created** - Validated structure, correct hash, no approval fields
2. ✅ **Checkpoint directory prepared** - With .gitignore and download instructions
3. ✅ **Test infrastructure fixed** - Added missing `tests/__init__.py`
4. ✅ **Backend .env configured** - Experimental settings with correct paths
5. ✅ **All testable code verified** - (figure from 2026-10-16: 85 tests, 63 backend + 22 assessor; superseded, see the addendum below)
6. ✅ **Configuration logic validated** - Gates, flags, environment checks work
7. ✅ **Integration documented** - This status report + existing docs

## J. Immediate Next Action

**USER MUST:**
```bash
# In a terminal OUTSIDE Kiro IDE (to avoid sandbox):
cd ~/Desktop/Projects/fire-evidence-assessor
gsutil cp gs://terrawatch-fire-ace-478304/runs/lora_s0/weights.pt checkpoint/weights.pt
shasum -a 256 checkpoint/weights.pt

# If hash matches 7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa:
# 1. Install experimental runtime in backend venv
# 2. Start backend (uvicorn app.main:app --reload)
# 3. Start frontend (npm run dev)
# 4. Test upload → assessment workflow
# 5. Run real-checkpoint tests
```

---

**INTEGRATION STATUS:** Ready to verify end-to-end once checkpoint is available locally.
