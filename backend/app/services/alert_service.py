"""Alert generation, deduplication, and lifecycle management service (Domain C)."""
from __future__ import annotations

import json
from datetime import datetime, timezone
from sqlalchemy import text

from ..database.session import engine
from .audit_log import write_audit_log

DEDUP_WINDOW_MINUTES = 15


def generate_alert(
    *,
    kind: str,
    message: str,
    state: str | None = None,
    severity: str = "warning",
    entity_type: str | None = None,
    entity_id: str | None = None,
    rule_id: int | None = None,
    user_id: int | None = None,
) -> tuple[dict, bool]:
    """Generates an operational alert with deduplication against active alerts.
    Returns (alert_row, created_boolean).
    """
    with engine.begin() as db:
        if entity_type and entity_id:
            dedupe_items = [entity_type, str(entity_id), kind]
            if rule_id is not None:
                dedupe_items.append(rule_id)
            if user_id is not None:
                dedupe_items.append(f"user:{user_id}")
            dedupe_key = json.dumps(dedupe_items, separators=(",", ":"))
            db.execute(
                text("SELECT pg_advisory_xact_lock(hashtextextended(:dedupe_key, 0))"),
                {"dedupe_key": dedupe_key},
            )
            rule_clause = "AND rule_id = :rule_id " if rule_id is not None else "AND rule_id IS NULL "
            # Each recipient is deduplicated separately; otherwise only the first person told about an event ever receives it.
            rule_clause += "AND user_id = :user_id " if user_id is not None else "AND user_id IS NULL "
            query_params = {
                "entity_type": entity_type,
                "entity_id": str(entity_id),
                "kind": kind,
                "minutes": DEDUP_WINDOW_MINUTES,
            }
            if rule_id is not None:
                query_params["rule_id"] = rule_id
            if user_id is not None:
                query_params["user_id"] = user_id
            existing = db.execute(
                text(
                    f"SELECT id, kind, message, state, severity, status, entity_type, entity_id, created_at "
                    f"FROM resq_alerts WHERE entity_type=:entity_type AND entity_id=:entity_id AND kind=:kind "
                    f"{rule_clause}"
                    f"AND status IN ('generated', 'acknowledged') "
                    f"AND created_at > now() - make_interval(mins => :minutes) "
                    f"ORDER BY created_at DESC LIMIT 1"
                ),
                query_params,
            ).mappings().first()
            if existing:
                return dict(existing), False

        row = db.execute(
            text(
                "INSERT INTO resq_alerts (user_id, rule_id, kind, message, state, severity, status, entity_type, entity_id, read) "
                "VALUES (:user_id, :rule_id, :kind, :message, :state, :severity, 'generated', :entity_type, :entity_id, false) "
                "RETURNING id, kind, message, state, severity, status, entity_type, entity_id, read, created_at"
            ),
            {
                "user_id": user_id,
                "rule_id": rule_id,
                "kind": kind,
                "message": message,
                "state": state,
                "severity": severity,
                "entity_type": entity_type,
                "entity_id": str(entity_id) if entity_id else None,
            },
        ).mappings().one()

        alert_dict = dict(row)
        write_audit_log(
            action="alert_generated",
            entity_type="alert",
            entity_id=str(alert_dict["id"]),
            user_id=user_id,
            metadata={"kind": kind, "severity": severity, "state": state, "entity_type": entity_type, "entity_id": entity_id},
            connection=db,
        )
    return alert_dict, True


def acknowledge_alert(alert_id: int, user_id: int) -> dict:
    with engine.begin() as db:
        prev = db.execute(text("SELECT status FROM resq_alerts WHERE id=:id"), {"id": alert_id}).scalar()
        if not prev:
            return {}
        row = db.execute(
            text(
                "UPDATE resq_alerts SET status='acknowledged', read=true "
                "WHERE id=:id RETURNING id, kind, message, state, severity, status, entity_type, entity_id, read, created_at"
            ),
            {"id": alert_id},
        ).mappings().first()
        alert_dict = dict(row)
        write_audit_log(
            action="alert_acknowledged",
            entity_type="alert",
            entity_id=str(alert_id),
            user_id=user_id,
            previous_state=prev,
            metadata={"status": "acknowledged"},
            connection=db,
        )
    return alert_dict


def resolve_alert(alert_id: int, user_id: int) -> dict:
    with engine.begin() as db:
        prev = db.execute(text("SELECT status FROM resq_alerts WHERE id=:id"), {"id": alert_id}).scalar()
        if not prev:
            return {}
        row = db.execute(
            text(
                "UPDATE resq_alerts SET status='resolved', read=true "
                "WHERE id=:id RETURNING id, kind, message, state, severity, status, entity_type, entity_id, read, created_at"
            ),
            {"id": alert_id},
        ).mappings().first()
        alert_dict = dict(row)
        write_audit_log(
            action="alert_resolved",
            entity_type="alert",
            entity_id=str(alert_id),
            user_id=user_id,
            previous_state=prev,
            metadata={"status": "resolved"},
            connection=db,
        )
    return alert_dict


SIZE_RANKS = {"unknown": 0, "small": 1, "moderate": 2, "medium": 2, "large": 3, "critical": 4}


def _matches_incident_conditions(
    rule_state: str | None,
    conditions: dict | str | None,
    incident_state: str | None,
    incident_size: str,
    incident_source: str | None = None,
) -> bool:
    if rule_state and incident_state and rule_state != incident_state:
        return False
    if rule_state and not incident_state:
        return False

    if not conditions:
        return True
    if isinstance(conditions, str):
        try:
            conditions = json.loads(conditions)
        except Exception:
            return False
    if not isinstance(conditions, dict):
        return False

    if "state" in conditions:
        cond_state = conditions["state"]
        if isinstance(cond_state, list):
            if incident_state not in cond_state:
                return False
        elif cond_state != incident_state:
            return False

    norm_size = incident_size.lower()
    if "size" in conditions:
        cond_size = conditions["size"]
        if isinstance(cond_size, list):
            if norm_size not in [s.lower() for s in cond_size]:
                return False
        elif cond_size.lower() != norm_size:
            return False

    if "sizes" in conditions:
        if norm_size not in [s.lower() for s in conditions["sizes"]]:
            return False

    if "min_size" in conditions:
        min_size = conditions["min_size"].lower()
        if SIZE_RANKS.get(norm_size, 0) < SIZE_RANKS.get(min_size, 0):
            return False

    if "source" in conditions:
        if not incident_source:
            return False
        cond_source = conditions["source"]
        if isinstance(cond_source, list):
            if incident_source not in cond_source:
                return False
        elif cond_source != incident_source:
            return False

    return True


def evaluate_rules_for_incident(
    incident_id: int,
    state: str | None,
    size: str,
    source: str | None = None,
) -> list[dict]:
    """Trigger active alert rules matching incident characteristics."""
    generated = []
    with engine.connect() as db:
        rules = db.execute(
            text("SELECT id, owner_id, name, kind, severity, state, conditions FROM resq_alert_rules WHERE enabled=true AND kind IN ('incident', 'all')")
        ).mappings().all()

    for rule in rules:
        if not _matches_incident_conditions(
            rule_state=rule.get("state"),
            conditions=rule.get("conditions"),
            incident_state=state,
            incident_size=size,
            incident_source=source,
        ):
            continue

        msg = f"Alert rule '{rule['name']}' triggered for incident #{incident_id} ({size})"
        alert, created = generate_alert(
            kind=rule["kind"],
            message=msg,
            state=state,
            severity=rule["severity"],
            entity_type="incident",
            entity_id=str(incident_id),
            rule_id=rule["id"],
            user_id=rule["owner_id"],
        )
        if created:
            generated.append(alert)
    return generated
