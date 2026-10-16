import os

# The test suite signs in as the development accounts, so it opts in explicitly. Production never seeds them.
os.environ.setdefault("RESQ_SEED_DEV_ACCOUNTS", "true")
os.environ.setdefault("RESQ_SECRET_KEY", "test-signing-secret-key-at-least-32-bytes-long")
