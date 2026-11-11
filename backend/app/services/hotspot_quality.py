"""Quality groups of satellite detections, posted by the forecast job and stored beside the hotspots. A detection without a group is shown as it always was; nothing is hidden by this table."""
from __future__ import annotations

import re

from sqlalchemy import text

from .ingest import _parse_detected_at

GROUPS = ("likely", "unconfirmed", "known_source", "outside_forest")
REASONS = {"industrial_near", "persistent_source", "outside_forest", "isolated_weak", "seen_again", "not_scored"}
MAX_ITEMS = 20000
_SAT = re.compile(r"^VIIRS_(SNPP|NOAA20)_(NRT|SP)$")

_UPSERT = text("""INSERT INTO resq_hotspot_quality (satellite,acq_datetime,latitude,longitude,grp,p_scar,reasons,scored_at)
    VALUES (:satellite,:acq_datetime,:latitude,:longitude,:grp,:p_scar,:reasons,now())
    ON CONFLICT (satellite,acq_datetime,latitude,longitude) DO UPDATE SET grp=EXCLUDED.grp, p_scar=EXCLUDED.p_scar, reasons=EXCLUDED.reasons, scored_at=now()""")


def clean(items: list[dict]) -> tuple[list[dict], int]:
    """Validate the posted rows; returns (rows ready for the table, number refused). A refused row never stops the others."""
    out, bad = [], 0
    for r in items[:MAX_ITEMS]:
        try:
            if not _SAT.match(str(r["satellite"])) or r["group"] not in GROUPS:
                raise ValueError("satellite or group")
            lat, lon = float(r["latitude"]), float(r["longitude"])
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise ValueError("position")
            p = r.get("p_scar"); p = None if p is None else float(p)
            if p is not None and not (0.0 <= p <= 1.0):
                raise ValueError("p_scar")
            reasons = [x for x in (r.get("reasons") or []) if x in REASONS][:6]
            out.append({"satellite": r["satellite"], "acq_datetime": _parse_detected_at(str(r["acq_date"]).strip(), str(r["acq_time"]).strip()), "latitude": lat, "longitude": lon, "grp": r["group"], "p_scar": p, "reasons": reasons})
        except (KeyError, TypeError, ValueError, OverflowError):
            bad += 1
    return out, bad + max(0, len(items) - MAX_ITEMS)


def store(rows: list[dict], engine) -> int:
    if not rows:
        return 0
    with engine.begin() as db:
        db.execute(_UPSERT, rows)
    return len(rows)
