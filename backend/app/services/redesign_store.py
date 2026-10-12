"""Persisted demo store for the redesign-v2 triage queue and field-report sync.

Deliberately separate from the Postgres/PostGIS database (`database/session.py`):
that database requires a running Postgres instance (see docker-compose.yml) which
is not assumed to be available wherever this app runs in Phase 2. This store is a
small file-backed SQLite database so triage actions and field reports persist
across requests and process restarts without an external dependency. It holds no
production data and is explicitly a demo store (see docs/redesign/10_backend_contract.md).
"""
from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DB_PATH = Path(__file__).resolve().parents[2] / "runtime_data" / "redesign_demo.sqlite3"


def _init(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS triage_actions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            detection_id TEXT NOT NULL,
            action TEXT NOT NULL CHECK (action IN ('verify','dismiss','escalate')),
            role TEXT NOT NULL,
            device_id TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE TABLE IF NOT EXISTS field_reports (
            idempotency_key TEXT PRIMARY KEY,
            task_id TEXT NOT NULL,
            note TEXT NOT NULL DEFAULT '',
            photo_name TEXT,
            device_id TEXT NOT NULL,
            captured_at TEXT NOT NULL,
            received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        """
    )
    conn.commit()


@contextmanager
def connect() -> Iterator[sqlite3.Connection]:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        _init(conn)
        yield conn
    finally:
        conn.close()


def record_triage_action(detection_id: str, action: str, role: str, device_id: str) -> dict:
    with connect() as conn:
        cur = conn.execute(
            "INSERT INTO triage_actions (detection_id, action, role, device_id) VALUES (?,?,?,?)",
            (detection_id, action, role, device_id),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM triage_actions WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def latest_status_by_detection() -> dict[str, dict]:
    """Most recent action per detection_id, keyed by detection_id."""
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM triage_actions ORDER BY id ASC"
        ).fetchall()
    latest: dict[str, dict] = {}
    for row in rows:
        latest[row["detection_id"]] = dict(row)
    return latest


def list_triage_history(detection_id: str) -> list[dict]:
    with connect() as conn:
        rows = conn.execute(
            "SELECT * FROM triage_actions WHERE detection_id=? ORDER BY id ASC", (detection_id,)
        ).fetchall()
        return [dict(row) for row in rows]


def upsert_field_report(idempotency_key: str, task_id: str, note: str, photo_name: str | None, device_id: str, captured_at: str) -> tuple[dict, bool]:
    """Insert a field report, deduping on idempotency_key. Returns (row, created)."""
    with connect() as conn:
        existing = conn.execute(
            "SELECT * FROM field_reports WHERE idempotency_key=?", (idempotency_key,)
        ).fetchone()
        if existing:
            return dict(existing), False
        conn.execute(
            "INSERT INTO field_reports (idempotency_key, task_id, note, photo_name, device_id, captured_at) VALUES (?,?,?,?,?,?)",
            (idempotency_key, task_id, note, photo_name, device_id, captured_at),
        )
        conn.commit()
        row = conn.execute("SELECT * FROM field_reports WHERE idempotency_key=?", (idempotency_key,)).fetchone()
        return dict(row), True


def list_field_reports() -> list[dict]:
    with connect() as conn:
        rows = conn.execute("SELECT * FROM field_reports ORDER BY received_at ASC").fetchall()
        return [dict(row) for row in rows]
