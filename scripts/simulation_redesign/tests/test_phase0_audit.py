import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import phase0_audit as p0  # noqa: E402


def make_csv(path, rows):
    """rows: (lat, lon, date, hhmm, sat). Writes a FIRMS-like CSV."""
    frame = pd.DataFrame(rows, columns=["latitude", "longitude", "acq_date", "acq_time", "satellite"])
    frame["confidence"] = "n"
    frame["type"] = 0
    frame["frp"] = 1.0
    frame["daynight"] = "N"
    frame.to_csv(path, index=False)


def km_to_deg_lat(km):
    return km / 111.195


def test_two_far_fires_are_two_events(tmp_path):
    rows = [(20.0, 80.0, "2024-03-01", "2000", "N"), (20.0, 80.001, "2024-03-01", "2001", "N"),
            (25.0, 85.0, "2024-03-01", "2000", "N")]
    make_csv(tmp_path / "a.csv", rows)
    df = p0.load_detections([tmp_path / "a.csv"])
    ids = p0.cluster_events(df["x_km"].to_numpy(), df["y_km"].to_numpy(), df["t_h"].to_numpy(), 1.0, 36.0)
    assert len(set(ids)) == 2


def test_time_gap_splits_events(tmp_path):
    rows = [(20.0, 80.0, "2024-03-01", "2000", "N"), (20.0, 80.0, "2024-03-05", "2000", "N")]
    make_csv(tmp_path / "a.csv", rows)
    df = p0.load_detections([tmp_path / "a.csv"])
    ids = p0.cluster_events(df["x_km"].to_numpy(), df["y_km"].to_numpy(), df["t_h"].to_numpy(), 1.0, 36.0)
    assert len(set(ids)) == 2


def test_chain_links_into_one_event(tmp_path):
    # a front that creeps north 0.8 km per pass stays linked by 1 km eps
    rows = [(20.0 + km_to_deg_lat(0.8 * i), 80.0, f"2024-03-0{1 + i // 2}", "0200" if i % 2 == 0 else "1400", "N") for i in range(6)]
    make_csv(tmp_path / "a.csv", rows)
    df = p0.load_detections([tmp_path / "a.csv"])
    ids = p0.cluster_events(df["x_km"].to_numpy(), df["y_km"].to_numpy(), df["t_h"].to_numpy(), 1.0, 36.0)
    assert len(set(ids)) == 1


def test_growth_and_gap_hours(tmp_path):
    # pass 1 at 02:00: two pixels. pass 2 at 14:00: same place plus a pixel 2 km north (new).
    rows = [(20.0, 80.0, "2024-03-01", "0200", "N"), (20.0, 80.002, "2024-03-01", "0201", "N"),
            (20.0, 80.0, "2024-03-01", "1400", "N"), (20.0 + km_to_deg_lat(2.0), 80.0, "2024-03-01", "1400", "N"),
            (20.0 + km_to_deg_lat(2.1), 80.0, "2024-03-01", "1401", "N")]
    make_csv(tmp_path / "a.csv", rows)
    df = p0.load_detections([tmp_path / "a.csv"])
    df["event_id"] = p0.cluster_events(df["x_km"].to_numpy(), df["y_km"].to_numpy(), df["t_h"].to_numpy(), 3.0, 36.0)
    events, cases = p0.build_cases(df, growth_tol_km=0.75, min_new=2, pass_gap_min=30.0)
    assert len(events) == 1 and events.loc[0, "n_passes"] == 2
    assert len(cases) == 1
    row = cases.iloc[0]
    assert row["gap_h"] == pytest.approx(12.0, abs=0.1)
    assert row["n_new"] == 2 and bool(row["growth"])
    assert row["advance_p95_km"] == pytest.approx(2.1, abs=0.1)
    assert row["gap_bin"] == "6-12h" or row["gap_bin"] == "12-24h"


def test_no_growth_when_same_place(tmp_path):
    rows = [(20.0, 80.0, "2024-03-01", "0200", "N"), (20.0, 80.0005, "2024-03-01", "1400", "N")]
    make_csv(tmp_path / "a.csv", rows)
    df = p0.load_detections([tmp_path / "a.csv"])
    df["event_id"] = 0
    _, cases = p0.build_cases(df, 0.75, 2, 30.0)
    assert len(cases) == 1 and not bool(cases.iloc[0]["growth"])


def test_split_passes_by_gap():
    t = np.array([0.0, 0.05, 0.1, 12.0, 12.05])
    assert list(p0.split_passes(t, 30.0)) == [0, 0, 0, 1, 1]


def test_required_events_values():
    assert p0.required_events(0.5) == 32
    assert p0.required_events(0.25) == 126


def test_low_confidence_is_dropped_by_default(tmp_path):
    rows = [(20.0, 80.0, "2024-03-01", "0200", "N")]
    make_csv(tmp_path / "a.csv", rows)
    frame = pd.read_csv(tmp_path / "a.csv", dtype=str)
    frame["confidence"] = "l"
    frame.to_csv(tmp_path / "a.csv", index=False)
    assert len(p0.load_detections([tmp_path / "a.csv"])) == 0
    assert len(p0.load_detections([tmp_path / "a.csv"], min_confidence="l")) == 1


def test_end_to_end_on_first_study_files(tmp_path):
    root = Path(__file__).resolve().parents[3] / "data" / "resq2"
    files = sorted(root.glob("*/viirs_detections.csv"))
    if not files:
        pytest.skip("first-study detection files not present")
    inp = tmp_path / "in"
    inp.mkdir()
    for f in files:
        (inp / f"{f.parent.name}.csv").write_bytes(f.read_bytes())
    summary = p0.run(type("A", (), dict(input_dir=inp, out_dir=tmp_path / "out", eps_km=1.0, event_gap_h=36.0, pass_gap_min=30.0,
                                         growth_tol_km=0.75, min_new=2, min_confidence="n", min_events=None, first_study_dir=root))())
    assert summary["n_detections"] > 0 and summary["n_events"] >= 1
    assert (tmp_path / "out" / "report.md").read_text().startswith("# Phase 0 feasibility audit")


def test_projection_distances_are_close_to_true():
    # 1 km north and 1 km east at several places across India stay within 2% of 1 km
    for lat, lon in [(8.5, 77.0), (20.0, 80.0), (28.0, 77.0), (24.0, 94.0), (33.0, 75.0)]:
        x0, y0 = p0.project_laea(np.array([lat]), np.array([lon]))
        dlat = 1.0 / 111.195
        dlon = 1.0 / (111.195 * np.cos(np.radians(lat)))
        xn, yn = p0.project_laea(np.array([lat + dlat]), np.array([lon]))
        xe, ye = p0.project_laea(np.array([lat]), np.array([lon + dlon]))
        assert np.hypot(xn - x0, yn - y0)[0] == pytest.approx(1.0, abs=0.02)
        assert np.hypot(xe - x0, ye - y0)[0] == pytest.approx(1.0, abs=0.02)


def test_header_only_file_is_skipped(tmp_path):
    make_csv(tmp_path / "a.csv", [(20.0, 80.0, "2024-03-01", "0200", "N")])
    (tmp_path / "empty.csv").write_text("latitude,longitude,acq_date,acq_time,satellite,confidence,type,frp,daynight\n")
    df = p0.load_detections([tmp_path / "a.csv", tmp_path / "empty.csv"])
    assert len(df) == 1 and df["latitude"].dtype.kind == "f"


def test_mask_keeps_only_points_inside(tmp_path):
    pytest.importorskip("shapely")
    make_csv(tmp_path / "a.csv", [(20.0, 80.0, "2024-03-01", "0200", "N"), (20.0, 96.0, "2024-03-01", "0200", "N")])
    df = p0.load_detections([tmp_path / "a.csv"])
    box = {"type": "Polygon", "coordinates": [[[70, 10], [90, 10], [90, 30], [70, 30], [70, 10]]]}
    (tmp_path / "m.geojson").write_text(__import__("json").dumps({"type": "Feature", "properties": {}, "geometry": box}))
    out = p0.apply_mask(df, tmp_path / "m.geojson")
    assert len(out) == 1 and float(out["longitude"].iloc[0]) == 80.0
