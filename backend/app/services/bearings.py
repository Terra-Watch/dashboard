"""Where citizen reports point. A report that carries a compass reading becomes a wedge on the map (its observer, the direction the phone pointed, how far
the citizen thinks it is); where several wedges overlap is a search area for the Control Room. It is an estimate from phone compasses: a search area, not a position.

ASSUMPTIONS (set by judgement, not measured; check against field tests): phone compasses are often 10 to 30 degrees off, so a compass reading gets a half-angle of
20 degrees and a direction picked by hand 22.5; the citizen's distance band is widened because people judge distance badly. Bearings are degrees clockwise from north.
"""
from __future__ import annotations

from itertools import combinations

from pyproj import Geod
from shapely.geometry import Point, Polygon

GEOD = Geod(ellps="WGS84")
HALF_ANGLE = {"compass": 20.0, "rose": 22.5}
BANDS_KM = {"close": (0.0, 1.5), "medium": (0.5, 4.0), "far": (2.0, 15.0), "unsure": (0.0, 15.0)}
MAX_WEDGES = 200          # the overlap search is quadratic
MAX_REGIONS = 5


def wedge(lat: float, lon: float, bearing: float, half_angle: float, r_min_km: float, r_max_km: float, step: float = 2.5) -> Polygon:
    """The ring sector (a wedge when r_min is 0) as a polygon in (lon, lat)."""
    n = max(2, int(2 * half_angle / step) + 1)
    angles = [bearing - half_angle + i * (2 * half_angle / (n - 1)) for i in range(n)]
    outer = [GEOD.fwd(lon, lat, a, r_max_km * 1000)[:2] for a in angles]
    inner = [(lon, lat)] if r_min_km <= 0 else [GEOD.fwd(lon, lat, a, r_min_km * 1000)[:2] for a in reversed(angles)]
    return Polygon(outer + inner)


def report_wedge(lat: float, lon: float, bearing: float, source: str, band: str) -> Polygon:
    r_min, r_max = BANDS_KM.get(band, BANDS_KM["unsure"])
    return wedge(lat, lon, bearing, HALF_ANGLE.get(source, HALF_ANGLE["rose"]), r_min, r_max)


def area_km2(poly: Polygon) -> float:
    return abs(GEOD.geometry_area_perimeter(poly)[0]) / 1e6


def search_areas(wedges: list[dict]) -> list[dict]:
    """wedges: [{'id':..., 'polygon': Polygon}]. Returns up to MAX_REGIONS non-overlapping regions covered by two or more wedges, best first
    (most wedges, then smallest). One wedge pointing the wrong way does not stop the others from agreeing: each region is built from the wedges that contain it."""
    items = wedges[:MAX_WEDGES]
    found = []
    for a, b in combinations(items, 2):
        inter = a["polygon"].intersection(b["polygon"])
        if inter.is_empty or inter.area == 0:
            continue
        for part in (inter.geoms if hasattr(inter, "geoms") else [inter]):
            if part.geom_type != "Polygon" or part.area == 0:
                continue
            probe = part.representative_point()
            members = [w for w in items if w["polygon"].contains(probe)]
            region = part
            for w in members:
                narrowed = region.intersection(w["polygon"])
                if not narrowed.is_empty and narrowed.geom_type == "Polygon":
                    region = narrowed
            found.append({"polygon": region, "ids": sorted(w["id"] for w in members), "count": len(members), "area_km2": area_km2(region)})
    found.sort(key=lambda r: (-r["count"], r["area_km2"]))
    chosen = []
    for r in found:
        if all(r["polygon"].intersection(c["polygon"]).area == 0 for c in chosen):
            chosen.append(r)
        if len(chosen) == MAX_REGIONS:
            break
    for r in chosen:
        c = r["polygon"].centroid
        r["centroid"] = (c.y, c.x)
    return chosen


def to_coords(poly: Polygon) -> list[list[float]]:
    """GeoJSON-style ring [[lon, lat], ...]."""
    return [[round(x, 6), round(y, 6)] for x, y in poly.exterior.coords]
