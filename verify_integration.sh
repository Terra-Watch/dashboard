#!/bin/bash
# TerraWatch Fire Evidence Assessor Integration Verification
# Run this script after downloading the checkpoint to verify the complete integration

set -e

CHECKPOINT_PATH="$HOME/Desktop/Projects/fire-evidence-assessor/checkpoint/weights.pt"
EXPECTED_SHA256="7bd5498f04838fe19240da2b7339d794cc5fc3948074a0d826c33303d5c42dfa"
ASSESSOR_REPO="$HOME/Desktop/Projects/fire-evidence-assessor"
BACKEND="$HOME/Desktop/Projects/RESQ/website/backend"

echo "========================================="
echo "Fire Evidence Assessor Integration Check"
echo "========================================="
echo

# 1. Check checkpoint existence
echo "1. Checking checkpoint..."
if [ ! -f "$CHECKPOINT_PATH" ]; then
    echo "❌ BLOCKER: Checkpoint not found at $CHECKPOINT_PATH"
    echo
    echo "Download it with:"
    echo "  gsutil cp gs://terrawatch-fire-ace-478304/runs/lora_s0/weights.pt $CHECKPOINT_PATH"
    exit 1
fi
echo "✅ Checkpoint file exists"

# 2. Verify size
SIZE=$(stat -f%z "$CHECKPOINT_PATH" 2>/dev/null || stat -c%s "$CHECKPOINT_PATH" 2>/dev/null)
EXPECTED_SIZE=345237991
if [ "$SIZE" != "$EXPECTED_SIZE" ]; then
    echo "❌ Size mismatch: got $SIZE, expected $EXPECTED_SIZE"
    exit 1
fi
echo "✅ Size correct: $SIZE bytes"

# 3. Verify SHA-256
echo "2. Computing SHA-256 (this takes ~1 second)..."
ACTUAL_SHA256=$(shasum -a 256 "$CHECKPOINT_PATH" | cut -d' ' -f1)
if [ "$ACTUAL_SHA256" != "$EXPECTED_SHA256" ]; then
    echo "❌ SHA-256 mismatch!"
    echo "   Expected: $EXPECTED_SHA256"
    echo "   Got:      $ACTUAL_SHA256"
    exit 1
fi
echo "✅ SHA-256 verified: ${ACTUAL_SHA256:0:16}..."

# 4. Check provenance file
echo "3. Checking provenance..."
PROVENANCE="$ASSESSOR_REPO/docs/provenance/lora_s0_provenance.json"
if [ ! -f "$PROVENANCE" ]; then
    echo "❌ Provenance file missing: $PROVENANCE"
    exit 1
fi
echo "✅ Provenance file exists"

# 5. Test assessor experimental module
echo "4. Testing assessor experimental module..."
cd "$ASSESSOR_REPO"
python3 -c "
import sys
sys.path.insert(0, 'src')
from fire_assessor.experimental import load_provenance, verify_experimental_checkpoint

# Test provenance
prov = load_provenance('$PROVENANCE', '$EXPECTED_SHA256')
print('✅ Provenance validated')

# Test checkpoint verification
verify_experimental_checkpoint('$CHECKPOINT_PATH', '$PROVENANCE', '$EXPECTED_SHA256')
print('✅ Checkpoint architecture verified')
" || exit 1

# 6. Run assessor tests with real checkpoint
echo "5. Running assessor tests with real checkpoint..."
cd "$ASSESSOR_REPO"
FIRE_EVIDENCE_REAL_CHECKPOINT="$CHECKPOINT_PATH" \
    python3 -m pytest tests/test_experimental.py -v -x || exit 1

# 7. Check backend configuration
echo "6. Checking backend configuration..."
cd "$BACKEND"
if ! grep -q "FIRE_EVIDENCE_EXPERIMENTAL_ENABLED=true" .env; then
    echo "❌ Backend .env not configured for experimental inference"
    exit 1
fi
echo "✅ Backend .env configured"

# 8. Run backend tests with real checkpoint
echo "7. Running backend experimental tests..."
FIRE_EVIDENCE_TEST_ASSESSOR_REPO="$ASSESSOR_REPO" \
FIRE_EVIDENCE_REAL_CHECKPOINT="$CHECKPOINT_PATH" \
    python3 -m pytest tests/test_fire_evidence_experimental.py -v -x || exit 1

echo
echo "========================================="
echo "✅ ALL CHECKS PASSED"
echo "========================================="
echo
echo "Next steps:"
echo "1. Install experimental runtime:"
echo "   cd $BACKEND"
echo "   pip install --extra-index-url https://download.pytorch.org/whl/cpu \\"
echo "     -r $ASSESSOR_REPO/requirements/experimental-inference.txt"
echo
echo "2. Start backend:"
echo "   cd $BACKEND"
echo "   uvicorn app.main:app --reload --port 8000"
echo
echo "3. Start frontend:"
echo "   cd $HOME/Desktop/Projects/RESQ/website/frontend"
echo "   npm run dev"
echo
echo "4. Test upload → assessment workflow through UI"
echo

