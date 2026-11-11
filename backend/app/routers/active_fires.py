"""Active fires (docs/23): fires built from the satellite detections of the last days, with their facts, growth, nearby named places, and what people did about them.
GET /api/fires (board), GET /api/fires/{id} (one fire with its footprints), POST /api/fires/{id}/mark (still burning / handled / out / not a forest fire), POST /api/fires/{id}/crew (a check in the normal queue).
Everything is observed; nothing here predicts where or when a fire will go."""
import re
import time
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..core.security import require_csrf, require_risk_roles
from ..database.session import engine
from ..services import active_fires as AF, audit_log, communities, places
from ..services.alert_service import generate_alert
from ..services.recipients import incident_staff_recipients
from .fire_spread import ROLES, _visible

router = APIRouter(prefix="/api/fires", tags=["active-fires"])
STAFF = ("control_room_operator", "incident_commander", "officer")
WINDOW_H = 96
_ID = re.compile(r"^[0-9a-f]{10}$")
_cache: dict = {"at": 0.0, "fires": None}

SQL = """SELECT h.acq_datetime AS t, h.latitude AS lat, h.longitude AS lon, h.frp, COALESCE(q.grp, 'unconfirmed') AS grp FROM resq_hotspots h
  LEFT JOIN resq_hotspot_quality q ON q.satellite=h.satellite AND q.acq_datetime=h.acq_datetime AND q.latitude=h.latitude AND q.longitude=h.longitude
  WHERE h.acq_datetime >= now() - make_interval(hours => :h) ORDER BY h.acq_datetime"""
SQL_PLAIN = "SELECT acq_datetime AS t, latitude AS lat, longitude AS lon, frp, 'unconfirmed' AS grp FROM resq_hotspots WHERE acq_datetime >= now() - make_interval(hours => :h) ORDER BY acq_datetime"


def detections(db) -> list[dict]:
    """Detections of the window that count as possible forest fire: known heat sources and detections outside forest are left out (they stay on the satellite page)."""
    try: rows = db.execute(text(SQL), {"h": WINDOW_H}).mappings().all()
    except Exception:
        db.rollback(); rows = db.execute(text(SQL_PLAIN), {"h": WINDOW_H}).mappings().all()
    return [dict(r) for r in rows if r["grp"] in ("likely", "unconfirmed")]


def _all_fires(now: datetime) -> list[dict]:
    if _cache["fires"] is not None and time.time() - _cache["at"] < 60: return _cache["fires"]
    with engine.connect() as db:
        dets = detections(db)
        marks = {r["fire_id"]: {"status": r["status"], "at": r["created_at"]} for r in db.execute(text("SELECT DISTINCT ON (fire_id) fire_id,status,created_at FROM resq_fire_marks ORDER BY fire_id, created_at DESC")).mappings()}
        tasked = {r[0] for r in db.execute(text("SELECT split_part(client_key,'-',2) FROM resq_incidents WHERE source='fire' AND status <> 'closed' AND created_at >= now() - interval '4 days'")).all()}
    fires = AF.build(dets, now, places.near, marks, tasked); _cache.update(at=time.time(), fires=fires)
    return fires


@router.get("")
def board(include_single: bool = Query(False), user: dict = Depends(require_risk_roles(*ROLES))) -> dict:
    now = datetime.now(timezone.utc); fires = _visible([f for f in _all_fires(now) if not f["closed"]], user)
    multi = [f for f in fires if f["multi"]]; shown = [f for f in (fires if include_single else multi) if f["status"] != "out"]
    active = [f for f in multi if f["status"] != "out"]
    return {"generated_at": now.isoformat(), "window_h": WINDOW_H, "counts": {"active": len(active), "growing": sum(1 for f in active if f["status"] == "growing"),
            "near_village": sum(1 for f in active if f["nearest"] and f["nearest"]["km"] <= 2), "no_task": sum(1 for f in active if not f["tasked"]), "single": len(fires) - len(multi)},
            "items": [{k: v for k, v in f.items() if k not in ("passes",)} | {"passes": f["passes"][-4:]} for f in shown]}


def _one(fire_id: str, user: dict) -> tuple[dict, list[dict]]:
    if not _ID.match(fire_id): raise HTTPException(status_code=404, detail="Fire not found")
    now = datetime.now(timezone.utc); f = next((x for x in _visible(_all_fires(now), user) if x["id"] == fire_id), None)
    if f is None: raise HTTPException(status_code=404, detail="Fire not found")
    with engine.connect() as db: dets = detections(db)
    group = next((g for g in AF.link(dets) if AF.fire_id(sorted(g, key=lambda d: d["t"])[0]) == fire_id), None)
    if group is None: raise HTTPException(status_code=404, detail="Fire not found")
    return f, group


@router.get("/{fire_id}")
def fire(fire_id: str, user: dict = Depends(require_risk_roles(*ROLES))) -> dict:
    f, group = _one(fire_id, user); now = datetime.now(timezone.utc)
    full = AF.describe(group, now, places.near, with_geometry=True)
    with engine.connect() as db:
        marks = db.execute(text("SELECT status,note,created_at FROM resq_fire_marks WHERE fire_id=:f ORDER BY created_at DESC LIMIT 10"), {"f": fire_id}).mappings().all()
        near_st = db.execute(text("""SELECT id,name,latitude,longitude FROM resq_stations WHERE active AND latitude BETWEEN :a AND :b AND longitude BETWEEN :c AND :d"""),
                             {"a": f["lat"] - 0.1, "b": f["lat"] + 0.1, "c": f["lon"] - 0.1, "d": f["lon"] + 0.1}).mappings().all()
    return {**full, "mark": f.get("mark"), "tasked": f["tasked"], "attention": f["attention"], "marks": [{"status": m["status"], "note": m["note"], "at": m["created_at"].isoformat()} for m in marks],
            "stations": [{"id": s["id"], "name": s["name"], "km": round(AF.km(f["lat"], f["lon"], s["latitude"], s["longitude"]), 1)} for s in near_st if AF.km(f["lat"], f["lon"], s["latitude"], s["longitude"]) <= 10],
            "note": "Observed from satellite detections. It does not say where the fire will go or when."}


class MarkBody(BaseModel):
    status: Literal["burning", "handled", "out", "not_forest_fire"]
    note: str = Field(default="", max_length=300)


@router.post("/{fire_id}/mark", dependencies=[Depends(require_csrf)])
def mark(fire_id: str, body: MarkBody, user: dict = Depends(require_risk_roles(*ROLES))) -> dict:
    f, _ = _one(fire_id, user)
    with engine.begin() as db:
        db.execute(text("INSERT INTO resq_fire_marks (fire_id,status,note,user_id,lat,lon) VALUES (:f,:s,:n,:u,:la,:lo)"), {"f": fire_id, "s": body.status, "n": body.note.strip(), "u": int(user["id"]), "la": f["lat"], "lo": f["lon"]})
        audit_log.write_audit_log(action="fire_marked", entity_type="fire", entity_id=fire_id, user_id=int(user["id"]), metadata={"status": body.status}, connection=db)
    _cache["fires"] = None
    return {"fire": fire_id, "status": body.status}


@router.post("/{fire_id}/crew", status_code=201, dependencies=[Depends(require_csrf)])
def crew(fire_id: str, user: dict = Depends(require_risk_roles(*STAFF))) -> dict:
    """Turn the fire into a check in the normal queue (source 'fire'), with its facts in the notes; a person then assigns a crew there. One open check per fire."""
    f, _ = _one(fire_id, user)
    with engine.begin() as db:
        old = db.execute(text("SELECT id FROM resq_incidents WHERE source='fire' AND client_key LIKE :k AND status <> 'closed' ORDER BY id DESC LIMIT 1"), {"k": f"fire-{fire_id}-%"}).scalar()
        if old: return {"created": False, "incident_id": int(old)}
        n = f.get("nearest"); hours = max(1, round((datetime.fromisoformat(f["last_seen"]) - datetime.fromisoformat(f["first_seen"])).total_seconds() / 3600))
        notes = " ".join(x for x in [f"Check created from the active fire board. Satellite fire seen {f['n_passes']} time(s) over {hours} h, about {f['area_km2']} km2, status {f['status']}.",
                  f"Grew toward the {f['grew_toward']}." if f.get("grew_toward") else "", f"Nearest named place {n['name']} ({n['kind']}), {n['km']} km from the edge." if n else "", "Observed by satellite; not yet checked by a person."] if x)
        cid = communities.at_point(db, f["lat"], f["lon"])
        iid = db.execute(text("""INSERT INTO resq_incidents (reporter_id,client_key,source,size,notes,state,latitude,longitude,observed_at,community_id)
            VALUES (:u,:k,'fire','unknown',:n,:st,:la,:lo,:ob,:c) RETURNING id"""), {"u": user["id"], "k": f"fire-{fire_id}-{int(time.time())}", "n": notes, "st": _state(f), "la": f["lat"], "lo": f["lon"],
                                                                                          "ob": datetime.fromisoformat(f["last_seen"]), "c": cid}).scalar()
        audit_log.write_audit_log(action="fire_check_created", entity_type="incident", entity_id=str(iid), user_id=int(user["id"]), metadata={"fire": fire_id}, connection=db)
    _cache["fires"] = None
    for rid in incident_staff_recipients(_state(f), community_id=cid):
        generate_alert(kind="fire_check", message=f"Check #{iid} from an active satellite fire is ready for review.", state=_state(f), severity="warning", entity_type="incident", entity_id=str(iid), user_id=rid)
    return {"created": True, "incident_id": int(iid)}


def _state(f: dict) -> str:
    from ..services.ingest import tag_state
    return tag_state(f["lat"], f["lon"]) or ""
