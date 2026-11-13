"""Download named protected areas (national parks, sanctuaries, reserves) in India from OpenStreetMap (Overpass), tile by tile with retries, as GeoJSON-like records.
Usage: python forecast/fetch_osm_protected.py --out ../terrawatch-datasets/dataset/osm_protected_areas.json
OpenStreetMap data is (c) OpenStreetMap contributors, ODbL."""
import argparse, json, time, urllib.parse, urllib.request
ap = argparse.ArgumentParser(); ap.add_argument("--out", required=True); ap.add_argument("--step", type=float, default=4.0); a = ap.parse_args()
SERVERS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]
Q = '[out:json][timeout:120];(relation["boundary"~"^(protected_area|national_park)$"]["name"]({b});relation["leisure"="nature_reserve"]["name"]({b}););out tags geom qt;'
found, tiles = {}, []
lat = 6.0
while lat < 37.0:
    lon = 68.0
    while lon < 98.0: tiles.append((lat, lon, min(lat + a.step, 37.0), min(lon + a.step, 98.0))); lon += a.step
    lat += a.step
for n, t in enumerate(tiles):
    for attempt in range(6):
        srv = SERVERS[(n + attempt) % len(SERVERS)]
        try:
            req = urllib.request.Request(srv, data=urllib.parse.urlencode({"data": Q.format(b=",".join(map(str, t)))}).encode(), headers={"User-Agent": "terrawatch-research"})
            els = json.load(urllib.request.urlopen(req, timeout=150))["elements"]; break
        except Exception as e:
            time.sleep(10 * (attempt + 1)); els = None
    if els is None: print("tile failed", t, flush=True); continue
    for e in els:
        tg = e.get("tags", {}); rings = [[(p["lon"], p["lat"]) for p in m["geometry"]] for m in e.get("members", []) if m.get("role") in ("outer", "") and m.get("geometry")]
        if rings: found[e["id"]] = {"id": e["id"], "name": tg.get("name"), "name_en": tg.get("name:en"), "kind": tg.get("protection_title") or tg.get("boundary") or tg.get("leisure"), "designation": tg.get("designation"), "rings": rings}
    print(n + 1, "/", len(tiles), len(found), flush=True); time.sleep(2)
json.dump(list(found.values()), open(a.out, "w")); print("saved", len(found))
