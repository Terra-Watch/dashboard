"""Tell staff when satellite detections gather in one place.

A cluster is CLUSTER_MIN or more detections (not counting those the quality job marked as a known heat source or outside forest) in the same 0.1 degree forest cell (about 11 km) within the last WINDOW_HOURS hours. Only detections inside the forest cells
the forecast covers are considered, so the state of a cluster is the state of that cell (not a guess from a bounding box). Each cluster is announced once per UTC day, to the
staff whose scope covers its state (the same people who are told about incidents there).
"""
from __future__ import annotations

from sqlalchemy import text

from . import alert_service
from .recipients import incident_staff_recipients

CLUSTER_MIN = 5
WINDOW_HOURS = 6
KIND = "satellite_cluster"

_CLUSTERS = text("""
    WITH h AS (
      SELECT (round(latitude*10)::bigint*1000 + round(longitude*10)::bigint) AS cell_id, max(acq_datetime) AS latest, count(*) AS n, max(frp) AS max_frp
      FROM resq_hotspots WHERE acq_datetime >= now() - make_interval(hours => :hours)
        AND NOT EXISTS (SELECT 1 FROM resq_hotspot_quality q WHERE q.satellite=resq_hotspots.satellite AND q.acq_datetime=resq_hotspots.acq_datetime AND q.latitude=resq_hotspots.latitude AND q.longitude=resq_hotspots.longitude AND q.grp IN ('known_source','outside_forest'))
      GROUP BY 1 HAVING count(*) >= :min_count)
    SELECT h.cell_id, h.latest, h.n, h.max_frp, c.state FROM h JOIN cells c ON c.id = h.cell_id
""")


def alert_clusters(engine, min_count: int = CLUSTER_MIN, window_hours: int = WINDOW_HOURS) -> dict:
    """Raise one alert per new cluster per recipient. Returns counts."""
    with engine.connect() as db:
        rows = db.execute(_CLUSTERS, {"hours": window_hours, "min_count": min_count}).mappings().all()
    new_clusters = alerts = 0
    for r in rows:
        key = f"{r['cell_id']}:{r['latest'].date().isoformat()}"
        with engine.connect() as db:
            seen = db.execute(text("SELECT 1 FROM resq_alerts WHERE kind=:k AND entity_type='hotspot_cluster' AND entity_id=:e LIMIT 1"), {"k": KIND, "e": key}).first()
        if seen:
            continue
        new_clusters += 1
        message = f"{r['n']} satellite detections within about 11 km in the last {window_hours} hours. Heat seen from space; nobody has checked it."
        for user_id in incident_staff_recipients(r["state"]):
            alert_service.generate_alert(kind=KIND, message=message, state=r["state"], severity="warning", entity_type="hotspot_cluster", entity_id=key, user_id=user_id)
            alerts += 1
    return {"clusters_found": len(rows), "new_clusters": new_clusters, "alerts": alerts}
