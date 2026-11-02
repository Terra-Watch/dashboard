"""Bearing wedges: shape, overlap, tightening with more reports, and one bad reading not breaking the rest. Pure geometry: no database."""
from __future__ import annotations

import sys
from pathlib import Path

from shapely.geometry import Point

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from app.services import bearings as b  # noqa: E402

FIRE = (20.30, 85.80)   # lat, lon of an imagined fire


def _from(lat, lon, source="compass", band="far", noise=0.0, target=FIRE):
    az = b.GEOD.inv(lon, lat, target[1], target[0])[0] % 360     # exact direction to the fire
    return {"polygon": b.report_wedge(lat, lon, (az + noise) % 360, source, band), "az": az}


def test_a_wedge_is_inside_its_range_and_angle():
    lat, lon = 20.0, 85.0
    w = b.wedge(lat, lon, 90.0, 20.0, 0.0, 5.0)
    for x, y in list(w.exterior.coords)[:-1]:
        az, _, dist = b.GEOD.inv(lon, lat, x, y)
        assert dist <= 5000.5
        assert dist < 1 or abs(((az % 360) - 90 + 180) % 360 - 180) <= 20.5
    assert abs(b.area_km2(w) - (20 * 2 / 360) * 3.14159 * 25) < 1.0     # a 40 degree sector of a 5 km circle, about 8.7 km2


def test_two_good_reports_overlap_around_the_fire():
    ws = [{"id": 1, **_from(20.27, 85.77)}, {"id": 2, **_from(20.27, 85.83)}]
    regions = b.search_areas(ws)
    assert len(regions) == 1 and regions[0]["count"] == 2
    assert regions[0]["polygon"].contains(Point(FIRE[1], FIRE[0]))
    assert regions[0]["area_km2"] < min(b.area_km2(w["polygon"]) for w in ws)


def test_more_reports_tighten_the_area():
    pos = [(20.27, 85.77), (20.27, 85.83), (20.34, 85.80), (20.33, 85.76)]
    ws = [{"id": i, **_from(*p)} for i, p in enumerate(pos)]
    two = b.search_areas(ws[:2])[0]["area_km2"]
    four = b.search_areas(ws)[0]
    assert four["count"] == 4 and four["area_km2"] < two
    assert four["polygon"].contains(Point(FIRE[1], FIRE[0]))


def test_one_wrong_report_does_not_hide_the_agreement():
    ws = [{"id": i, **_from(*p)} for i, p in enumerate([(20.27, 85.77), (20.27, 85.83), (20.34, 85.80)])]
    ws.append({"id": 9, "polygon": b.report_wedge(20.30, 85.70, 270.0, "compass", "far")})    # points away
    best = b.search_areas(ws)[0]
    assert best["count"] == 3 and 9 not in best["ids"] and best["polygon"].contains(Point(FIRE[1], FIRE[0]))


def test_wedges_that_do_not_meet_give_nothing():
    ws = [{"id": 1, "polygon": b.report_wedge(20.0, 85.0, 0.0, "compass", "close")}, {"id": 2, "polygon": b.report_wedge(25.0, 80.0, 0.0, "compass", "close")}]
    assert b.search_areas(ws) == []
