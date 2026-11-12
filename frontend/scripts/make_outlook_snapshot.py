"""Writes src/features/landing/outlookData.ts from one fire of the served spread-outlook run folder: the three bands, what burned, the roads, nearby named places, the start footprint, and the share of what burned that the top band held.
Usage: python scripts/make_outlook_snapshot.py RUN_DIR EVENT   (needs shapely)"""
import sys, json, math, unicodedata
from shapely.geometry import shape
from shapely.ops import unary_union
run, ev = sys.argv[1], sys.argv[2]
events = json.load(open(f"{run}/events.json")); fire = next(f for f in events["fires"] if f["event"] == ev)
lon0, lat0 = fire["lon"], fire["lat"]; kx = 111.32 * math.cos(math.radians(lat0)); ky = 110.57; half = 7.0
def pt(c): return round(((c[0] - lon0) * kx + half) / (2 * half) * 100, 1), round((half - (c[1] - lat0) * ky) / (2 * half) * 100, 1)
def rings(g): return [g["coordinates"][0]] if g["type"] == "Polygon" else [p[0] for p in g["coordinates"]]
def poly(g): return "".join("M" + "L".join(f"{x} {y}" for x, y in map(pt, r)) + "Z" for r in rings(g))
def line(c): return "M" + "L".join(f"{x} {y}" for x, y in map(pt, c))
load = lambda n: json.load(open(f"{run}/{n}"))
bands = {int(f["properties"]["band"]): poly(f["geometry"]) for f in load(f"{ev}_48h.geojson")["features"]}
bf = load(f"{ev}_burned_48h.geojson")["features"]; burned = "".join(poly(f["geometry"]) for f in bf)
top = shape(next(f for f in load(f"{ev}_48h.geojson")["features"] if int(f["properties"]["band"]) == 3)["geometry"])
b = unary_union([shape(f["geometry"]) for f in bf]); covers = round(100 * b.intersection(top).area / b.area)
km2 = round(b.area * kx * ky, 1)
roads = "".join(line(f["geometry"]["coordinates"]) for f in load(f"{ev}_roads_48h.geojson")["features"] if f["geometry"]["type"] == "LineString")
places = [{"name": f["properties"]["name"], "kind": f["properties"]["kind"], "xy": list(pt(f["geometry"]["coordinates"]))} for f in load(f"{ev}_places_48h.geojson")["features"]
          if f["properties"]["kind"] in ("village", "town") and 6 < pt(f["geometry"]["coordinates"])[0] < 94 and 6 < pt(f["geometry"]["coordinates"])[1] < 94][:2]
fp = load(f"{ev}_pixels.geojson")["features"]; foot = "".join(poly(f["geometry"]) for f in fp)
pts = [pt(c) for f in fp for r in rings(f["geometry"]) for c in r]; cx, cy = sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)
sm = fire["horizons"]["48"]["summary"]
out = (f"// Generated from the spread-outlook run {events['run']}, fire {ev} ({fire['state']}). Archived fire, scored as it would have been then. Roads and places from OpenStreetMap.\n"
       f"export const OUTLOOK = {{ state: {json.dumps(unicodedata.normalize('NFKD', fire['state']).encode('ascii', 'ignore').decode())}, halfKm: {half}, centre: [{cx:.1f}, {cy:.1f}], bearing: {json.dumps(sm['bearing'])}, bearingDeg: {sm['bearing_deg']}, cover: {json.dumps(sm['cover'])}, slope: {sm['slope_deg']}, uphill: {sm['uphill_share']}, bands: {json.dumps(bands)}, burned: {json.dumps(burned)}, burnedKm2: {km2}, topCovers: {covers}, roads: {json.dumps(roads)}, places: {json.dumps(places)}, footprint: {json.dumps(foot)} }};\n")
open("src/features/landing/outlookData.ts", "w").write(out); print(len(out) // 1000, "kB", len(places), "places", "top band holds", covers, "% of", km2, "km2")
