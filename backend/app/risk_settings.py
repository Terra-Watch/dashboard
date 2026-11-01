"""Settings for the risk-forecast layer. Read here only; no other module touches these variables."""
import os
from pathlib import Path


def forecast_enabled() -> bool:
    return os.getenv("RISK_FORECAST_ENABLED", "").strip().lower() in ("true", "1", "yes")


def bundle_dir() -> str | None:
    """RISK_MODEL_BUNDLE, else a bundle folder shipped next to the app (backend/models/risk)."""
    configured = os.getenv("RISK_MODEL_BUNDLE")
    if configured:
        return configured
    local = Path(__file__).resolve().parents[1] / "models" / "risk"
    return str(local) if local.exists() else None


def max_age_hours() -> int:
    """A run older than this is shown as stale. RISK_FORECAST_MAX_AGE_HOURS, default 36."""
    try:
        return max(1, int(os.getenv("RISK_FORECAST_MAX_AGE_HOURS", "36")))
    except ValueError:
        return 36


def ingest_token() -> str | None:
    """RISK_INGEST_TOKEN: the shared secret the daily job sends to POST /api/risk/runs. Unset means the endpoint does not exist."""
    return os.getenv("RISK_INGEST_TOKEN", "").strip() or None
