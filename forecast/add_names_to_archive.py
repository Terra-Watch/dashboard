"""Add the protected area or forest name (`inside`) to every place to look in the archived days, from forecast/data/cell_names.json. Safe to run twice.
Usage: python forecast/add_names_to_archive.py backend/area_forecast_data"""
import json, sys, glob, os
names = json.load(open(os.path.join(os.path.dirname(__file__), "data", "cell_names.json"))); n = k = 0
for f in sorted(glob.glob(f"{sys.argv[1]}/2*.json")):
    d = json.load(open(f))
    for a in d.get("areas", []):
        for l in a.get("look", []): l["inside"] = names.get(f"{l['lat']:.1f},{l['lon']:.1f}"); n += 1; k += l["inside"] is not None
    json.dump(d, open(f, "w"), separators=(",", ":"))
print(k, "of", n, "places named")
