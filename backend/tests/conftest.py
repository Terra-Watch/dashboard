import os

# The test suite signs in as the development accounts, so it opts in explicitly. Production never seeds them.
os.environ.setdefault("RESQ_SEED_DEV_ACCOUNTS", "true")
os.environ.setdefault("RESQ_SECRET_KEY", "test-signing-secret-key-at-least-32-bytes-long")

# The local .env may turn media-integrity reporting on; the tests assume the documented default (off) unless a test sets it itself.
os.environ.setdefault("FIRE_EVIDENCE_REPORT_AUTHENTICITY_ENABLED", "false")
