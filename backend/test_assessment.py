#!/usr/bin/env python3
"""Test fire evidence assessment in running backend"""
import sys
import os
import asyncio
from pathlib import Path

# Load .env
env_file = Path(__file__).parent / '.env'
if env_file.exists():
    with open(env_file) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                key, value = line.split('=', 1)
                os.environ[key] = value

sys.path.insert(0, str(Path(__file__).parent / 'app'))

from services import image_assessment as ia
from PIL import Image
import io

print("=== Fire Evidence Assessment Test ===\n")

# Create test image
img = Image.new('RGB', (640, 480), color=(255, 100, 0))  # Orange
buf = io.BytesIO()
img.save(buf, 'JPEG', quality=95)
test_data = buf.getvalue()

print(f"Test image: {len(test_data)} bytes, 640x480 JPEG\n")

print("Configuration:")
print(f"  TERRAWATCH_ENV: {os.getenv('TERRAWATCH_ENV')}")
print(f"  FIRE_EVIDENCE_EXPERIMENTAL_ENABLED: {os.getenv('FIRE_EVIDENCE_EXPERIMENTAL_ENABLED')}")
print(f"  FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT: {os.getenv('FIRE_EVIDENCE_EXPERIMENTAL_CHECKPOINT')}")
print(f"  development_environment(): {ia.development_environment()}")
print(f"  experimental_requested(): {ia.experimental_requested()}")
print()

# Run assessment
print("Running assessment...")
result = asyncio.run(ia.assess_image_async(test_data, "test_image_001"))

print("\nResult:")
print(f"  assessment_status: {result.get('assessment_status')}")
print(f"  model_version: {result.get('model_version')}")
print(f"  error_code: {result.get('error_code')}")

if result.get('raw_logits'):
    logits = result['raw_logits']
    print(f"  raw_logits:")
    print(f"    flames_visible: {logits.get('flames_visible'):.4f}")
    print(f"    smoke_visible: {logits.get('smoke_visible'):.4f}")
    
if result.get('assessment_status') == 'EXPERIMENTAL':
    print("\n✅ EXPERIMENTAL INFERENCE WORKING!")
    print(f"   Checkpoint: {result.get('checkpoint_sha256', 'N/A')[:16]}...")
    print(f"   Notice: {result.get('notice', 'N/A')}")
elif result.get('assessment_status') == 'UNAVAILABLE':
    print(f"\n⚠️  Assessment unavailable: {result.get('error_code')}")
else:
    print(f"\n❓ Unexpected status: {result.get('assessment_status')}")

# Check service state
state = ia.load_state()
print(f"\nService State:")
print(f"  experimental_loaded: {state['experimental_loaded']}")
print(f"  experimental_load_error: {state['experimental_load_error']}")
