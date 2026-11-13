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
FIELD_ROLES = ("field_crew", "range_officer")      # rangers: they see their own community only


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


def community_scope(user_id: int) -> set[int] | None:
    """The communities an admin explicitly gave this person, or None for an older account that only has state scopes."""
    with engine.connect() as db:
        rows = set(db.execute(text("SELECT community_id FROM resq_user_community_scopes WHERE user_id=:u"), {"u": user_id}).scalars().all())
    return rows or None


def uncovered_communities() -> set[int]:
    """Communities no active Control Room operator or commander covers: not by an explicit grant, nor (older accounts) by a state scope."""
    with engine.connect() as db:
        return set(db.execute(text("""SELECT c.id FROM resq_communities c WHERE NOT EXISTS (
            SELECT 1 FROM resq_users u WHERE u.role = ANY(:roles) AND u.deactivated_at IS NULL AND (
              EXISTS (SELECT 1 FROM resq_user_community_scopes x WHERE x.user_id=u.id AND x.community_id=c.id)
              OR (NOT EXISTS (SELECT 1 FROM resq_user_community_scopes x WHERE x.user_id=u.id)
                  AND EXISTS (SELECT 1 FROM resq_user_scopes s WHERE s.user_id=u.id AND s.state=c.state))))"""), {"roles": list(CATCH_ALL_ROLES)}).scalars().all())


def scope_clause(user: dict[str, object], state_col: str, community_col: str, include_uncovered: bool = False) -> tuple[str, dict[str, object]]:
    """SQL for 'rows this person may see'. A person with community grants sees those communities (and rows with no community in their states); an older account sees its states."""
    if user.get("role") == "admin":
        return "TRUE", {}
    uid = int(user["id"])
    states = sorted(user_scopes(uid, include_uncovered=include_uncovered))
    comms = community_scope(uid)
    if comms is None:
        return (f"{state_col} = ANY(CAST(:sc_states AS text[]))", {"sc_states": states}) if states else ("FALSE", {})
    if user.get("role") in FIELD_ROLES:      # a ranger with community grants sees those communities and nothing else: no state-wide rows, no rows without a community
        return (f"{community_col} = ANY(CAST(:sc_comms AS int[]))", {"sc_comms": sorted(comms)})
    if include_uncovered and user.get("role") in CATCH_ALL_ROLES:
        comms = comms | uncovered_communities()
    return (f"({community_col} = ANY(CAST(:sc_comms AS int[])) OR ({community_col} IS NULL AND {state_col} = ANY(CAST(:sc_states AS text[]))))",
            {"sc_comms": sorted(comms), "sc_states": states})


def ranger_communities(user: dict[str, object]) -> list[int] | None:
    """The community ids a ranger was given, or None when the person is not a ranger or only has older state scopes (then the state decides)."""
    if user.get("role") not in FIELD_ROLES:
        return None
    return sorted(community_scope(int(user["id"])) or []) or None


def within_communities_sql(lat: str, lon: str, ids_param: str = "rc_ids") -> str:
    """SQL: the point (lat, lon columns or expressions) lies inside one of the circles of the communities in :ids_param (great-circle distance against each radius_km)."""
    return (f"EXISTS (SELECT 1 FROM resq_communities rc WHERE rc.id = ANY(CAST(:{ids_param} AS int[])) AND 12742.0 * asin(sqrt("
            f"power(sin(radians({lat} - rc.latitude) / 2), 2) + cos(radians({lat})) * cos(radians(rc.latitude)) * power(sin(radians({lon} - rc.longitude) / 2), 2))) <= rc.radius_km)")


def in_communities(ids: list[int], lat: float, lon: float) -> bool:
    """Python twin of within_communities_sql, for features that are filtered after they are loaded."""
    from ..services import communities as comms
    with engine.connect() as db:
        rows = db.execute(text("SELECT latitude,longitude,radius_km FROM resq_communities WHERE id = ANY(:ids)"), {"ids": list(ids)}).mappings().all()
    return any(comms._km(lat, lon, r["latitude"], r["longitude"]) <= r["radius_km"] for r in rows)


def touches_communities(ids: list[int], bbox: list[float] | tuple[float, ...]) -> bool:
    """Does a forest community's circle reach into this box (west, south, east, north)? A ranger's forest is a few km wide and a forecast area is 55 km, so the area that contains the forest is the area to show."""
    from ..services import communities as comms
    with engine.connect() as db:
        rows = db.execute(text("SELECT latitude,longitude,radius_km FROM resq_communities WHERE id = ANY(:ids)"), {"ids": list(ids)}).mappings().all()
    return any(comms._km(min(max(r["latitude"], bbox[1]), bbox[3]), min(max(r["longitude"], bbox[0]), bbox[2]), r["latitude"], r["longitude"]) <= r["radius_km"] for r in rows)


def _community_of(entity_type: str, entity_id: str) -> int | None:
    """The community of an incident, or of the incident an alert is about, when the entity id says which."""
    if not str(entity_id).isdigit():
        return None
    with engine.connect() as db:
        if entity_type.startswith("incident"):
            return db.execute(text("SELECT community_id FROM resq_incidents WHERE id=:i"), {"i": int(entity_id)}).scalar()
        if entity_type == "alert":
            return db.execute(text("""SELECT i.community_id FROM resq_alerts a JOIN resq_incidents i ON a.entity_type='incident' AND i.id::text=a.entity_id
                WHERE a.id=:i"""), {"i": int(entity_id)}).scalar()
    return None


def require_scope(user: dict[str, object], state: str | None, *, entity_type: str, entity_id: str, community_id: int | None = None) -> None:
    """Raise 403 unless `user` is admin or covers the entity: its community when the person was given communities, otherwise its state. Audits denials.
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

    incident_like = str(entity_type).startswith("incident")
    if community_id is None:
        community_id = _community_of(str(entity_type), str(entity_id))
    mine = community_scope(int(user["id"])) if community_id is not None else None
    if mine is not None:   # given communities: the entity's own community decides, not its state
        if community_id in mine or (incident_like and user.get("role") in CATCH_ALL_ROLES and community_id in uncovered_communities()):
            return
    elif state in user_scopes(int(user["id"]), include_uncovered=incident_like):
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
