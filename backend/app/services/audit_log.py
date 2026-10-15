"""Persistent audit log service implementing docs/product/AUDIT_LOG.md.
Provides single action record, latest action queries, and complete chronological history.
"""
from __future__ import annotations

import json
from typing import NamedTuple

from sqlalchemy import text

from ..database.session import engine


class AuditEntry(NamedTuple):
    action: str
    previous_state: str | None
    occurred_at: str
    user_id: int | None
    metadata: dict


def write_audit_log(
    *,
    action: str,
    entity_type: str,
    entity_id: str,
    user_id: int | None = None,
    device_id: str | None = None,
    previous_state: str | None = None,
    metadata: dict | None = None,
    connection=None,
) -> None:
    stmt = text(
        "INSERT INTO resq_audit_log (user_id, device_id, action, previous_state, entity_type, entity_id, metadata) "
        "VALUES (:user_id, :device_id, :action, :previous_state, :entity_type, :entity_id, CAST(:metadata AS jsonb))"
    )
    params = {
        "user_id": user_id,
        "device_id": device_id,
        "action": action,
        "previous_state": previous_state,
        "entity_type": entity_type,
        "entity_id": str(entity_id),
        "metadata": json.dumps(metadata or {}),
    }
    if connection is not None:
        connection.execute(stmt, params)
    else:
        with engine.begin() as db:
            db.execute(stmt, params)


def get_latest_action(entity_type: str, entity_id: str) -> AuditEntry | None:
    with engine.connect() as db:
        row = db.execute(
            text(
                "SELECT action, previous_state, occurred_at, user_id, metadata FROM resq_audit_log "
                "WHERE entity_type=:entity_type AND entity_id=:entity_id ORDER BY occurred_at DESC, id DESC LIMIT 1"
            ),
            {"entity_type": entity_type, "entity_id": str(entity_id)},
        ).mappings().first()
    if not row:
        return None
    return AuditEntry(row["action"], row["previous_state"], row["occurred_at"].isoformat(), row["user_id"], row["metadata"])


def get_latest_actions(entity_type: str, entity_ids: list[str]) -> dict[str, AuditEntry]:
    if not entity_ids:
        return {}
    with engine.connect() as db:
        rows = db.execute(
            text(
                "SELECT DISTINCT ON (entity_id) entity_id, action, previous_state, occurred_at, user_id, metadata "
                "FROM resq_audit_log WHERE entity_type=:entity_type AND entity_id = ANY(:entity_ids) "
                "ORDER BY entity_id, occurred_at DESC, id DESC"
            ),
            {"entity_type": entity_type, "entity_ids": [str(e) for e in entity_ids]},
        ).mappings().all()
    return {
        row["entity_id"]: AuditEntry(row["action"], row["previous_state"], row["occurred_at"].isoformat(), row["user_id"], row["metadata"])
        for row in rows
    }


def get_all_actions(entity_type: str, entity_id: str) -> list[AuditEntry]:
    """Return complete chronological history with deterministic tie-break by audit row id."""
    with engine.connect() as db:
        rows = db.execute(
            text(
                "SELECT action, previous_state, occurred_at, user_id, metadata FROM resq_audit_log "
                "WHERE entity_type=:entity_type AND entity_id=:entity_id ORDER BY occurred_at ASC, id ASC"
            ),
            {"entity_type": entity_type, "entity_id": str(entity_id)},
        ).mappings().all()
    return [
        AuditEntry(row["action"], row["previous_state"], row["occurred_at"].isoformat(), row["user_id"], row["metadata"])
        for row in rows
    ]
