"""Writes src/features/landing/outlookData.ts from one fire of a spread-outlook run folder: both horizons (bands, what burned, summary, people), the roads and named places, and the start footprint, projected to a square picture.
Usage: python scripts/make_outlook_snapshot.py RUN_DIR EVENT"""
import sys, json, math
run, ev = sys.argv[1], sys.argv[2]
events = json.load(open(f"{run}/events.json")); fire = next(f for f in events["fires"] if f["event"] == ev)
lon0, lat0 = fire["lon"], fire["lat"]; kx = 111.32 * math.cos(math.radians(lat0)); ky = 110.57; half = 9.5
def pt(c): return round(((c[0] - lon0) * kx + half) / (2 * half) * 100, 1), round((half - (c[1] - lat0) * ky) / (2 * half) * 100, 1)
def rings(g): return [g["coordinates"][0]] if g["type"] == "Polygon" else [p[0] for p in g["coordinates"]]
def poly(g): return "".join("M" + "L".join(f"{x} {y}" for x, y in map(pt, r)) + "Z" for r in rings(g))
def line(c): return "M" + "L".join(f"{x} {y}" for x, y in map(pt, c))
load = lambda n: json.load(open(f"{run}/{n}"))
hz = {}
for H in (24, 48):
    h = fire["horizons"][str(H)]; bands = load(f"{ev}_{H}h.geojson"); burned = load(f"{ev}_burned_{H}h.geojson"); s = h["summary"]; a = h["affected"]
    hz[str(H)] = {"bands": {int(f["properties"]["band"]): poly(f["geometry"]) for f in bands["features"]}, "burned": "".join(poly(f["geometry"]) for f in burned["features"]),
                  "bearing": s["bearing"], "bearingDeg": s["bearing_deg"], "cover": s["cover"], "slope": s["slope_deg"], "uphill": s["uphill_share"], "people": {b: a["bands"][b]["people"] for b in "321"}}
roads = "".join(line(f["geometry"]["coordinates"]) for f in load(f"{ev}_roads_24h.geojson")["features"] if f["geometry"]["type"] == "LineString")
places = [{"name": f["properties"]["name"], "kind": f["properties"]["kind"], "xy": list(pt(f["geometry"]["coordinates"]))} for f in load(f"{ev}_places_24h.geojson")["features"]
          if f["properties"]["kind"] in ("village", "town") and 4 < pt(f["geometry"]["coordinates"])[0] < 96 and 4 < pt(f["geometry"]["coordinates"])[1] < 96][:5]
foot = [list(pt(f["geometry"]["coordinates"])) for f in load(f"{ev}_pixels.geojson")["features"]]
cx, cy = sum(p[0] for p in foot) / len(foot), sum(p[1] for p in foot) / len(foot)
out = (f"// Generated from the spread-outlook run {events['run']}, fire {ev} ({fire['state']}). Archived fire, scored as it would have been then. Roads and places from OpenStreetMap.\n"
       f"export const OUTLOOK = {{ state: {json.dumps(fire['state'])}, halfKm: {half}, centre: [{cx:.1f}, {cy:.1f}], horizons: {json.dumps(hz)}, roads: {json.dumps(roads)}, places: {json.dumps(places)}, footprint: {json.dumps(foot)} }};\n")
open("src/features/landing/outlookData.ts", "w").write(out); print(len(out) // 1000, "kB", len(places), "places")
