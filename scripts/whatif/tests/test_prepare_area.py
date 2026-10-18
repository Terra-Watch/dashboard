"""Tests for prepare_area.py on synthetic data. No network, no rasterio."""
import json
import math
import sys
from pathlib import Path

import numpy as np
import pytest
from pyproj import Transformer

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import prepare_area as P  # noqa: E402

SIM = (21.8679, 86.5007)


def spec(size_km=10, cell=30):
    return P.make_grid_spec(SIM[0], SIM[1], size_km, cell)


def synth_gradient(spec_, pad_deg=0.01, d=1 / 3600.0, f=lambda lon, lat: 0.0):
    """Geographic north-up raster whose value is a linear function of lon/lat."""
    w, s, e, n = P.grid_lonlat_bounds(spec_, pad_deg)
    ncol = int(math.ceil((e - w) / d))
    nrow = int(math.ceil((n - s) / d))
    lon0, lat0 = w, s + nrow * d
    cols = lon0 + (np.arange(ncol) + 0.5) * d
    rows = lat0 - (np.arange(nrow) + 0.5) * d
    LON, LAT = np.meshgrid(cols, rows)
    return f(LON, LAT), lon0, lat0, d


# --- grid and CRS -----------------------------------------------------------

def test_utm_zone_similipal_is_45n():
    assert P.utm_epsg(*SIM) == 32645
    assert P.utm_epsg(-33.9, 18.4) == 32734


def test_grid_dims_and_snapping():
    g = spec()
    assert g["width"] == g["height"] == 334  # ceil(10000/30)
    assert g["originX"] % 30 == 0 and g["originY"] % 30 == 0
    assert (g["width"] * 30) >= 10000


def test_corner_round_trip_within_1m():
    g = spec()
    c = P.grid_corners_lonlat(g)
    fwd = Transformer.from_crs(4326, g["epsg"], always_xy=True)
    xmin, ymin, xmax, ymax = P.grid_extent_utm(g)
    expect = {"nw": (xmin, ymax), "ne": (xmax, ymax), "se": (xmax, ymin), "sw": (xmin, ymin)}
    for k, (ex, ey) in expect.items():
        x, y = fwd.transform(c[k]["lon"], c[k]["lat"])
        assert abs(x - ex) < 1.0 and abs(y - ey) < 1.0


def test_centre_inside_grid_near_middle():
    g = spec()
    fwd = Transformer.from_crs(4326, g["epsg"], always_xy=True)
    x, y = fwd.transform(SIM[1], SIM[0])
    col = (x - g["originX"]) / 30
    row = (g["originY"] - y) / 30
    assert abs(col - 167) < 1.5 and abs(row - 167) < 1.5


# --- resampling alignment ---------------------------------------------------

def test_bilinear_gradient_stays_gradient_and_lands_on_right_cells():
    g = spec()
    f = lambda lon, lat: 1000.0 * (lon - 86.0) + 500.0 * (lat - 21.0)  # noqa: E731
    src, lon0, lat0, d = synth_gradient(g, f=f)
    lon, lat = P.cell_centres_lonlat(g)
    out = P.resample_geographic(src, lon0, lat0, d, d, lon, lat, "bilinear")
    assert not np.isnan(out).any()
    # a linear field is reproduced exactly by bilinear interpolation
    np.testing.assert_allclose(out, f(lon, lat), atol=1e-6)
    # lands on the right cells: east increases with column, north increases toward row 0
    assert out[:, -1].mean() > out[:, 0].mean()
    assert out[0, :].mean() > out[-1, :].mean()


def test_nearest_picks_the_containing_pixel():
    src = np.arange(16, dtype=float).reshape(4, 4)
    # pixel size 1 deg, origin (10E, 24N): pixel (r=1,c=2) covers lon 12..13, lat 22..23
    out = P.resample_geographic(src, 10.0, 24.0, 1.0, 1.0, np.array([12.4]), np.array([22.6]), "nearest")
    assert out[0] == src[1, 2]


def test_outside_raster_is_nan_and_mosaic_fills():
    src = np.ones((3, 3))
    a = P.resample_geographic(src, 0.0, 3.0, 1.0, 1.0, np.array([1.5, 5.0]), np.array([1.5, 1.5]), "bilinear")
    assert a[0] == 1.0 and np.isnan(a[1])
    b = np.array([7.0, 7.0])
    np.testing.assert_array_equal(P.combine_first_valid([a, b]), [1.0, 7.0])


def test_bilinear_ignores_nan_neighbours():
    src = np.array([[1.0, np.nan], [3.0, 3.0]])
    out = P.resample_geographic(src, 0.0, 2.0, 1.0, 1.0, np.array([1.0]), np.array([1.0]), "bilinear")
    assert np.isfinite(out[0]) and 1.0 <= out[0] <= 3.0


# --- land cover mapping -----------------------------------------------------

def test_nearest_landcover_keeps_only_valid_codes():
    rng = np.random.default_rng(1)
    codes = np.array(P.WORLDCOVER_CODES, dtype=float)
    src = rng.choice(codes, size=(60, 60))
    g = spec(size_km=1.0)
    lon, lat = P.cell_centres_lonlat(g)
    out = P.resample_geographic(src, lon.min() - 0.001, lat.max() + 0.001,
                                (lon.max() - lon.min() + 0.002) / 60, (lat.max() - lat.min() + 0.002) / 60,
                                lon, lat, "nearest")
    u8, bad = P.landcover_to_u8(out)
    assert bad == 0
    assert set(np.unique(u8)).issubset(set(P.WORLDCOVER_CODES))
    assert set(np.unique(out)).issubset(set(codes))  # nearest never invents blends


def test_invalid_and_nan_codes_become_zero():
    u8, bad = P.landcover_to_u8(np.array([10.0, 11.0, np.nan, 255.0, 80.0]))
    assert u8.tolist() == [10, 0, 0, 0, 80]
    assert bad == 3


# --- encoding / layout ------------------------------------------------------

def test_i16_little_endian_row_major_round_trip():
    a = np.array([[1, -2, 300], [4000, -32767, 0]], dtype=float)
    q, void = P.elevation_to_i16(a)
    assert void == 0
    b = P.encode_i16_le(q)
    assert b[:2] == (1).to_bytes(2, "little", signed=True)
    assert b[2:4] == (-2).to_bytes(2, "little", signed=True)
    np.testing.assert_array_equal(P.decode_i16_le(b, 3, 2), q)
    assert len(b) == 12


def test_nan_elevation_is_nodata():
    q, void = P.elevation_to_i16(np.array([[np.nan, 5.4]]))
    assert q.tolist() == [[P.NODATA_I16, 5]] and void == 1


def test_u8_round_trip():
    a = np.array([[10, 20], [80, 0]], dtype=np.uint8)
    np.testing.assert_array_equal(P.decode_u8(P.encode_u8(a), 2, 2), a)


# --- tiles ------------------------------------------------------------------

def test_tile_names_and_urls():
    assert P.dem_tile_url(21, 86) == (
        "https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N21_00_E086_00_DEM/"
        "Copernicus_DSM_COG_10_N21_00_E086_00_DEM.tif")
    assert "N21E084" in P.worldcover_tile_url(21, 84)
    assert "S34_00_E018_00" in P.dem_tile_url(-34, 18)
    assert "W070" in P.dem_tile_url(10, -70)
    assert P.tiles_for_bounds(P.grid_lonlat_bounds(spec()), 1) == [(21, 86)]
    assert P.tiles_for_bounds(P.grid_lonlat_bounds(spec()), 3) == [(21, 84)]
    assert len(P.tiles_for_bounds((85.9, 20.9, 86.1, 21.1), 1)) == 4


# --- vector geometry --------------------------------------------------------

def test_clip_polyline_and_polygon():
    parts = P.clip_polyline([(-5, 5), (15, 5)], 0, 0, 10, 10)
    assert parts == [[(0.0, 5.0), (10.0, 5.0)]]
    assert P.clip_polyline([(-5, -5), (-1, -1)], 0, 0, 10, 10) == []
    ring = P.clip_polygon([(-5, -5), (15, -5), (15, 15), (-5, 15)], 0, 0, 10, 10)
    xs = [p[0] for p in ring]
    ys = [p[1] for p in ring]
    assert min(xs) == 0 and max(xs) == 10 and min(ys) == 0 and max(ys) == 10


def test_simplify_and_cap():
    line = [(i, math.sin(i / 5.0) * 3) for i in range(400)]
    assert len(P.simplify_dp(line, 0.5)) < 400
    assert P.simplify_dp(line, 0)[0] == line[0]
    lines = [[(i + 50 * k, math.sin(i / 3.0 + k) * 20) for i in range(300)] for k in range(10)]
    out, tol = P.simplify_to_cap(lines, 500)
    assert sum(len(l) for l in out) <= 500 and tol >= 2.0


OSM_XML = b"""<?xml version="1.0"?><osm version="0.6">
<node id="1" lat="21.8679" lon="86.5007"><tag k="place" v="village"/><tag k="name" v="Testpur"/></node>
<node id="2" lat="21.0" lon="80.0"><tag k="place" v="hamlet"/></node>
<node id="10" lat="21.84" lon="86.47"/><node id="11" lat="21.86" lon="86.50"/><node id="12" lat="21.88" lon="86.53"/>
<node id="13" lat="21.90" lon="86.60"/>
<node id="20" lat="21.85" lon="86.49"/><node id="21" lat="21.85" lon="86.51"/><node id="22" lat="21.87" lon="86.51"/>
<way id="100"><nd ref="10"/><nd ref="11"/><nd ref="12"/><nd ref="13"/><tag k="highway" v="track"/></way>
<way id="101"><nd ref="10"/><nd ref="11"/><tag k="highway" v="footway"/></way>
<way id="102"><nd ref="20"/><nd ref="21"/><nd ref="22"/><nd ref="20"/><tag k="natural" v="water"/></way>
<way id="103"><nd ref="10"/><nd ref="12"/><tag k="waterway" v="stream"/></way>
</osm>"""


def test_osm_classification_and_assets():
    c = P.classify_osm(P.parse_osm_xml(OSM_XML))
    assert len(c["villages"]) == 2 and len(c["roads"]) == 1  # footway excluded
    assert len(c["water_rings"]) == 1 and len(c["water_lines"]) == 1
    g = spec()
    gj, st = P.build_assets(c, g)
    assert st["villages"] == 1  # the far hamlet is outside the grid
    kinds = [f["properties"]["kind"] for f in gj["features"]]
    assert kinds.count("village") == 1 and kinds.count("road") == 1 and kinds.count("water") == 2
    assert "OpenStreetMap" in gj["attribution"]
    road = next(f for f in gj["features"] if f["properties"]["kind"] == "road")
    xmin, ymin, xmax, ymax = P.grid_lonlat_bounds(g, 0.001)
    for lon, lat in road["geometry"]["coordinates"]:
        assert xmin <= lon <= xmax and ymin <= lat <= ymax  # clipped to the square


def test_vertex_cap_respected():
    pts = [(86.46 + i * 0.0002, 21.85 + 0.002 * math.sin(i / 3.0)) for i in range(400)]
    cl = {"villages": [], "water_lines": [], "water_rings": [],
          "roads": [{"id": "way/1", "pts": pts, "highway": "track", "name": ""}]}
    _, st = P.build_assets(cl, spec(), road_cap=30)
    assert st["roadVertices"] <= 30 and st["roadVerticesBeforeSimplify"] > 30


# --- manifest and pack ------------------------------------------------------

def make_pack(tmp_path, big=False):
    g = spec(size_km=3.0)
    rng = np.random.default_rng(0)
    elev = rng.uniform(100, 700, (g["height"], g["width"]))
    lc = np.full((g["height"], g["width"]), 10.0)
    lc[:5, :5] = 80
    e, _ = P.elevation_to_i16(elev)
    l, _ = P.landcover_to_u8(lc)
    assets = {"type": "FeatureCollection", "features": []}
    src = [{"layer": "x", "licence": "test", "attribution": "test", "urls": []}]
    return g, e, l, P.write_pack(tmp_path, "test", g, e, l, assets, src, {"k": 1}, "2026-01-01T00:00:00Z")


def test_manifest_hashes_verify_and_detect_tamper(tmp_path):
    g, e, l, m = make_pack(tmp_path)
    assert P.verify_manifest(tmp_path) == []
    names = {f["name"] for f in m["files"]}
    assert names == {"elevation.i16", "landcover.u8", "assets.json"}
    ef = next(f for f in m["files"] if f["name"] == "elevation.i16")
    assert ef["bytes"] == g["width"] * g["height"] * 2
    (tmp_path / "landcover.u8").write_bytes(b"\x00" * (g["width"] * g["height"]))
    assert any("sha256" in p for p in P.verify_manifest(tmp_path))


def test_manifest_content_and_layout_round_trip(tmp_path):
    g, e, l, m = make_pack(tmp_path)
    j = json.loads((tmp_path / "manifest.json").read_text())
    assert j["syntheticInputs"] == "none" and "Spread rates are not part of this pack" in j["statement"]
    assert j["crs"]["epsg"] == 32645 and j["grid"]["width"] == g["width"]
    assert set(j["cornersLonLat"]) == {"nw", "ne", "se", "sw"}
    assert j["grid"]["orientation"].startswith("north-up")
    got = P.decode_i16_le((tmp_path / "elevation.i16").read_bytes(), g["width"], g["height"])
    np.testing.assert_array_equal(got, e)
    gl = P.decode_u8((tmp_path / "landcover.u8").read_bytes(), g["width"], g["height"])
    assert gl[0, 0] == 80 and gl[10, 10] == 10
    assert j["buildTime"] == "2026-01-01T00:00:00Z"


def test_size_cap_enforced(tmp_path):
    g = P.make_grid_spec(SIM[0], SIM[1], 40.0, 10.0)  # 4000x4000 -> 32 MB + 16 MB
    e = np.zeros((g["height"], g["width"]), dtype="<i2")
    l = np.full((g["height"], g["width"]), 10, dtype=np.uint8)
    with pytest.raises(RuntimeError, match="cap"):
        P.write_pack(tmp_path, "big", g, e, l, {"type": "FeatureCollection", "features": []}, [], {})


def test_default_similipal_pack_is_small(tmp_path):
    g = spec()
    n = g["width"] * g["height"]
    assert n * 3 < P.SIZE_CAP_BYTES  # 334x334, 3 bytes per cell
