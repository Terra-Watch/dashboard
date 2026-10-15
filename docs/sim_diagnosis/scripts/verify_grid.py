"""Rebuild the 40x40 inputs in memory exactly as run_demo_simulation._build_grid (lines 42-69) does, compare with the staged ASC files, and report the
ground footprint of the land-cover and DEM windows. Nothing is written except docs/sim_diagnosis/grid_verification.json. Needs rasterio."""
import json
from pathlib import Path
import numpy as np, rasterio
from rasterio.windows import Window
W = Path("/Users/kireeti/Desktop/Projects/RESQ/website"); DATA = W / "backend/runtime_data/simulation_demo"
LAT0, LON0 = 21.867894, 86.500688; ROWS = COLS = 40; CELL = 30
def asc(p): return np.array([l.split() for l in Path(p).read_text().splitlines()[6:]], dtype=float)
with rasterio.open(DATA / "landcover/worldcover_similipal_demo.tif") as lc, rasterio.open(DATA / "terrain/elevation_similipal_demo.tif") as dem:
    lcc = rasterio.transform.rowcol(lc.transform, LON0, LAT0); dc = rasterio.transform.rowcol(dem.transform, LON0, LAT0)
    lw = Window(lcc[1] - COLS * 1.5, lcc[0] - ROWS * 1.5, COLS * 3, ROWS * 3); dw = Window(dc[1] - COLS / 2, dc[0] - ROWS / 2, COLS, ROWS)
    lcr = lc.read(1, window=lw, boundless=True, fill_value=0); der = dem.read(1, window=dw, boundless=True, fill_value=0).astype("float32")
    lb = rasterio.windows.bounds(lw, lc.transform); db = rasterio.windows.bounds(dw, dem.transform)
    lcres = (abs(lc.transform.a), abs(lc.transform.e)); dres = (abs(dem.transform.a), abs(dem.transform.e)); crs = (str(lc.crs), str(dem.crs)); nod = (lc.nodata, dem.nodata)
mx = 111319.49 * np.cos(np.radians(LAT0)); my = 110574.0
g = lcr.reshape(ROWS, 3, COLS, 3)
major = np.apply_along_axis(lambda v: int(np.bincount(v.astype(int)).argmax()), 3, g)
major = np.apply_along_axis(lambda v: int(np.bincount(v.astype(int)).argmax()), 1, major)
fuel = np.vectorize(lambda v: {10: 182, 20: 145, 30: 101, 40: 93, 50: 91, 60: 99, 70: 92, 80: 98, 90: 99, 95: 182, 100: 101}.get(int(v), 99))(major)
res = {
 "landcover_crs_dem_crs": crs, "nodata": nod,
 "landcover_pixel_deg": lcres, "dem_pixel_deg": dres,
 "landcover_pixel_m_EW_NS": [lcres[0] * mx, lcres[1] * my], "dem_pixel_m_EW_NS": [dres[0] * mx, dres[1] * my],
 "landcover_window_bounds_deg(w,s,e,n)": lb, "dem_window_bounds_deg(w,s,e,n)": db,
 "landcover_window_size_m_EW_NS": [(lb[2] - lb[0]) * mx, (lb[3] - lb[1]) * my], "dem_window_size_m_EW_NS": [(db[2] - db[0]) * mx, (db[3] - db[1]) * my],
 "nominal_grid_m": [COLS * CELL, ROWS * CELL],
 "fuel_matches_staged_fuels_asc": bool(np.array_equal(fuel, asc(DATA / "scenario/fuels.asc").astype(int))),
 "elevation_matches_staged_elevation_asc_after_int": bool(np.array_equal(der.astype(int), asc(DATA / "scenario/elevation.asc").astype(int))),
 "worldcover_classes_in_window": sorted(int(v) for v in np.unique(major)),
 "boundless_fill_cells_used": int((lcr == 0).sum()),
 "row_order": "row 0 = north in both rasters and in the ASC files (no flip)",
}
(Path(__file__).resolve().parents[1] / "grid_verification.json").write_text(json.dumps(res, indent=1, default=float))
print(json.dumps(res, indent=1, default=float))
