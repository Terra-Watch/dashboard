"""Web push for confirmed-fire alerts. Off unless PUSH_VAPID_PUBLIC_KEY and PUSH_VAPID_PRIVATE_KEY are set.

Who gets one: people who turned it on and chose a state that matches the alert's state. At most one push per alert per phone (the log), the text is fixed and short
(the details are in the app), and a phone that has gone away (404 or 410) is forgotten. Sending happens in the request that published the alert, so it is capped in
count and time; shortcut: a state with more subscribers than the cap needs a background worker, add one when that happens.
"""
from __future__ import annotations

import json
import logging
import os
import time
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import text

from ..database.session import engine

logger = logging.getLogger(__name__)
MAX_PER_ALERT = 200
TIME_BUDGET_S = 15


def public_key() -> str:
    return os.getenv("PUSH_VAPID_PUBLIC_KEY", "").strip()


def enabled() -> bool:
    return bool(public_key() and os.getenv("PUSH_VAPID_PRIVATE_KEY", "").strip())


def _send_one(subscription: dict, payload: str) -> int:
    """HTTP status of the push service's answer (201 is delivered), 0 when it could not be reached. Replaceable in tests."""
    from pywebpush import WebPushException, webpush
    try:
        webpush(subscription_info={"endpoint": subscription["endpoint"], "keys": {"p256dh": subscription["p256dh"], "auth": subscription["auth"]}}, data=payload,
                vapid_private_key=os.environ["PUSH_VAPID_PRIVATE_KEY"].strip(), vapid_claims={"sub": os.getenv("PUSH_CONTACT", "mailto:alerts@example.invalid")},
                ttl=3600, headers={"Urgency": "high"}, timeout=5)
        return 201
    except WebPushException as exc:
        return int(getattr(exc.response, "status_code", 0) or 0)
    except Exception:
        return 0


def send_for_notice(notice_id: int, state: str, title: str) -> dict:
    """Push the alert to every subscribed phone for this state that has not had it yet. Never raises."""
    if not enabled():
        return {"sent": 0, "skipped": "push is not configured"}
    try:
        with engine.connect() as db:
            rows = db.execute(text("""SELECT s.id,s.endpoint,s.p256dh,s.auth FROM resq_push_subscriptions s
                WHERE s.state=:st AND NOT EXISTS (SELECT 1 FROM resq_push_log l WHERE l.notice_id=:n AND l.subscription_id=s.id) ORDER BY s.id LIMIT :cap"""),
                              {"st": state, "n": notice_id, "cap": MAX_PER_ALERT}).mappings().all()
        payload = json.dumps({"title": title, "body": "Open TerraWatch for details.", "url": "/citizen/near-me", "tag": f"alert-{notice_id}"})
        started, sent, gone = time.monotonic(), 0, []
        def work(row):
            return row, (_send_one(dict(row), payload) if time.monotonic() - started < TIME_BUDGET_S else -1)
        with ThreadPoolExecutor(max_workers=8) as pool:
            for row, status in pool.map(work, rows):
                if status == 201:
                    sent += 1
                    with engine.begin() as db:
                        db.execute(text("INSERT INTO resq_push_log (notice_id,subscription_id) VALUES (:n,:s) ON CONFLICT DO NOTHING"), {"n": notice_id, "s": row["id"]})
                        db.execute(text("UPDATE resq_push_subscriptions SET last_ok_at=now() WHERE id=:s"), {"s": row["id"]})
                elif status in (404, 410):
                    gone.append(row["id"])
        if gone:
            with engine.begin() as db:
                db.execute(text("DELETE FROM resq_push_subscriptions WHERE id = ANY(:ids)"), {"ids": gone})
        return {"sent": sent, "forgotten": len(gone), "candidates": len(rows)}
    except Exception:
        logger.exception("push for notice %s failed", notice_id)
        return {"sent": 0, "skipped": "error"}
