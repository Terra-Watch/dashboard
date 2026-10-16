"""Live data feeds (NASA FIRMS hotspots, weather context).

Rules (decision D-15): credentials are read from the environment at call time only and are
never printed, logged, stored or placed in an error message. Messages carry no URL.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import httpx

# httpx logs every request URL at INFO, and the FIRMS URL contains the key in its path.
for _name in ("httpx", "httpcore"):
    logging.getLogger(_name).setLevel(logging.WARNING)

TIMEOUT_S = 20.0
SATELLITE_LABEL = "Satellite signal, not confirmed by a person"


class FeedError(RuntimeError):
    """A feed failure whose message is safe to show to a client (no URL, no key)."""

    def __init__(self, message: str, *, not_configured: bool = False):
        super().__init__(message)
        self.not_configured = not_configured


def http_client() -> httpx.Client:
    """Default client factory; tests replace the callers' `client` argument with a MockTransport client."""
    return httpx.Client(timeout=TIMEOUT_S, headers={"User-Agent": "terrawatch-feeds/1.0"})


def stale_minutes() -> int | None:
    raw = os.environ.get("FEED_STALE_MINUTES")
    if raw is None or not raw.strip():
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def freshness(source: str, fetched_at: datetime | None, now: datetime | None = None) -> dict:
    """{source, fetched_at, age_seconds, stale}. `stale` is null unless FEED_STALE_MINUTES is set."""
    now = now or datetime.now(timezone.utc)
    limit = stale_minutes()
    if fetched_at is None:
        return {"source": source, "fetched_at": None, "age_seconds": None, "stale": None if limit is None else True}
    if fetched_at.tzinfo is None:
        fetched_at = fetched_at.replace(tzinfo=timezone.utc)
    age = max(0, int((now - fetched_at).total_seconds()))
    return {"source": source, "fetched_at": fetched_at.isoformat(), "age_seconds": age,
            "stale": None if limit is None else age > limit * 60}
