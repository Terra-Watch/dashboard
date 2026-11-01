"""State/division scope enforcement for roles.

Default-deny: a non-admin role with zero `resq_user_scopes` rows sees/acts on nothing.
A scope violation returns 403 (visibly a permission error), never a filtered-empty 200.
Every out-of-division access attempt is written to the audit log.
If audit logging fails, the operation fails closed with HTTP 500.
"""
from __future__ import annotations

import logging
from fastapi import HTTPException
from sqlalchemy import text

from ..database.session import engine
from ..services.audit_log import write_audit_log

logger = logging.getLogger(__name__)



CATCH_ALL_ROLES = ("control_room_operator", "incident_commander")


def uncovered_states() -> set[str]:
    """States that no active Control Room operator or commander has in their scope. Nothing reported there should sit unseen."""
    from .regions import state_names
    with engine.connect() as db:
        covered = set(db.execute(
            text("SELECT DISTINCT s.state FROM resq_user_scopes s JOIN resq_users u ON u.id=s.user_id WHERE u.role = ANY(:roles) AND u.deactivated_at IS NULL"),
            {"roles": list(CATCH_ALL_ROLES)},
        ).scalars().all())
    return set(state_names()) - covered


def user_scopes(user_id: int, include_uncovered: bool = False) -> set[str]:
    """The states a person may work in: their own scopes. With include_uncovered, Control Room operators and commanders also get every state nobody in those roles covers yet (used for incidents, field work and alerts, so no report sits unseen)."""
    with engine.connect() as db:
        rows = set(db.execute(text("SELECT state FROM resq_user_scopes WHERE user_id=:uid"), {"uid": user_id}).scalars().all())
        role = db.execute(text("SELECT role FROM resq_users WHERE id=:uid"), {"uid": user_id}).scalar()
    return rows | uncovered_states() if include_uncovered and role in CATCH_ALL_ROLES else rows


def require_scope(user: dict[str, object], state: str | None, *, entity_type: str, entity_id: str) -> None:
    """Raise 403 unless `user` is admin or has `state` in their scope. Audits denials.
    Fails closed with 500 if the audit log write fails.
    """
    if user.get("role") == "admin":
        return

    if not state:
        try:
            write_audit_log(
                action="out_of_division_access_denied",
                entity_type=entity_type,
                entity_id=str(entity_id),
                user_id=int(user["id"]),
                metadata={"attempted_state": None, "reason": "missing_authoritative_state", "role": str(user.get("role"))},
            )
        except Exception as exc:
            logger.error("Failed to write denial audit log: %s", exc)
            raise HTTPException(
                status_code=500,
                detail="Security denial audit failure. Operation failed closed.",
            ) from exc
        raise HTTPException(status_code=403, detail="Resource has no authoritative state to establish scope")

    if state in user_scopes(int(user["id"]), include_uncovered=str(entity_type).startswith("incident")):
        return

    # Attempt to write audit log for out-of-division access denial
    try:
        write_audit_log(
            action="out_of_division_access_denied",
            entity_type=entity_type,
            entity_id=str(entity_id),
            user_id=int(user["id"]),
            metadata={"attempted_state": state, "role": str(user.get("role"))},
        )
    except Exception as exc:
        logger.error("Failed to write denial audit log: %s", exc)
        raise HTTPException(
            status_code=500,
            detail="Security denial audit failure. Operation failed closed.",
        ) from exc

    raise HTTPException(status_code=403, detail="This is outside your division's scope")
