"""Internal verification of the replay-metrics and baseline math behind redesign-v2.

The Replay/evidence screen and the Incident screen's proximity-baseline toggle were removed
from the rendered UI (user amendment: don't surface AUC/AP/IoU numbers or baseline-comparison
framing to end users). The underlying computation in
backend/app/services/redesign_data.py was NOT deleted — it's still correct, still used
internally, and still worth protecting against regression. These tests are that protection,
replacing the now-removed frontend assertions (incident/replay "baseline overlay visible",
the cross-incident win-count table) with a direct check of the same math.

Run with: python -m unittest discover -s backend/tests (from the website root, using
backend/.venv — see tests/test_simulation_pipeline.py for the same convention).
"""
import sys
import unittest
import json
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.services import redesign_data as rd  # noqa: E402

INCIDENTS = list(rd.REPLAY_INCIDENTS)

# Expected cross-incident win counts for the primary simulation (era5land_native) at each
# incident's last overpass, against reference=obs_nh — recomputed by hand from
# results/resq5/*/metrics_by_overpass.csv at the time this test was written. If source data
# changes, this test should fail loudly rather than silently drift.
EXPECTED_WINS_OUT_OF_4 = {
    "auc_vs_proximity": 0,
    "ap_vs_proximity": 0,
    "ap_vs_circle": 3,
    "iou_vs_proximity": 1,
    "iou_vs_circle": 1,
}


class CrossIncidentWinCountTests(unittest.TestCase):
    def test_matches_expected_counts(self):
        counts = rd.cross_incident_win_counts()
        self.assertEqual(counts["wins_out_of_4"], EXPECTED_WINS_OUT_OF_4)
        self.assertEqual(counts["n_incidents"], 4)

    def test_per_incident_breakdown_sums_to_totals(self):
        counts = rd.cross_incident_win_counts()
        for metric, total in counts["wins_out_of_4"].items():
            summed = sum(1 for wins in counts["per_incident"].values() if wins[metric])
            self.assertEqual(summed, total, f"{metric}: per-incident breakdown doesn't sum to the reported total")


class ReplayForTests(unittest.TestCase):
    def test_every_incident_has_all_models_and_a_source_citation(self):
        for incident_id in INCIDENTS:
            detail = rd.replay_for(incident_id)
            self.assertEqual(detail["incident_id"], incident_id)
            self.assertTrue(detail["development_incident"])
            self.assertIn("simulation:era5land_native", detail["model_labels"])
            self.assertIn("baseline_a_proximity", detail["model_labels"])
            self.assertIn("baseline_b_circle_final_area", detail["model_labels"])
            self.assertIn("metrics_by_overpass.csv", detail["source"])

    def test_unknown_incident_raises(self):
        with self.assertRaises(KeyError):
            rd.replay_for("not-a-real-incident")


class BaselineGeometryTests(unittest.TestCase):
    def test_proximity_radius_matches_protocol_formula(self):
        # RESQ5_PROTOCOL.md §8(a): p(d) = exp(-d/1000m); the p=0.5 disc is d <= 1000*ln(2) m.
        self.assertAlmostEqual(rd.PROXIMITY_BASELINE_RADIUS_M, 693.15, places=1)

    def test_circles_for_every_incident_are_centred_on_the_ignition_point(self):
        for incident_id in INCIDENTS:
            circles = rd.baseline_circles_geojson(incident_id)
            ignition = rd.nominal_ignition(incident_id)
            for key in ("proximity", "circle_final_area"):
                fc = circles[key]
                self.assertEqual(len(fc["features"]), 1)
                poly = fc["features"][0]["geometry"]
                self.assertEqual(poly["type"], "Polygon")
                # The polygon's centroid (mean of its ring's vertices) should land very close to
                # the ignition point — not an exact match (it's a discretised circle, not the
                # ignition point itself), but within a small fraction of the circle's own radius.
                ring = poly["coordinates"][0]
                lon_mean = sum(p[0] for p in ring) / len(ring)
                lat_mean = sum(p[1] for p in ring) / len(ring)
                self.assertAlmostEqual(lon_mean, ignition["lon"], places=2)
                self.assertAlmostEqual(lat_mean, ignition["lat"], places=2)

    def test_circle_final_area_radius_matches_summary_json(self):
        for incident_id in INCIDENTS:
            circles = rd.baseline_circles_geojson(incident_id)
            expected = rd._summary(incident_id)["baseline_circle_radius_m"]
            self.assertAlmostEqual(circles["circle_final_area"]["features"][0]["properties"]["radius_m"], expected, places=1)


class GeoReferencingTests(unittest.TestCase):
    def test_ignition_point_falls_inside_domain_bounds_for_every_incident(self):
        for incident_id in INCIDENTS:
            bounds = rd.domain_bounds_wgs84(incident_id)
            ignition = rd.nominal_ignition(incident_id)
            west, south, east, north = bounds
            self.assertTrue(west < ignition["lon"] < east, f"{incident_id}: ignition lon outside domain bounds")
            self.assertTrue(south < ignition["lat"] < north, f"{incident_id}: ignition lat outside domain bounds")

    def test_scenario_ignition_marker_matches_prescribed_simulation_input(self):
        setup_path = Path(__file__).resolve().parents[2] / "data" / "resq5" / "protocol_setup.json"
        setup = json.loads(setup_path.read_text())
        for incident_id in INCIDENTS:
            lat, lon = setup[incident_id]["ignition_lat_lon"]
            self.assertEqual(rd.nominal_ignition(incident_id), {"lat": lat, "lon": lon})
            self.assertEqual(rd.simulation_start_utc(incident_id), setup[incident_id]["t0_utc"].replace(" ", "T") + "Z")

    def test_probability_grid_geojson_is_a_valid_feature_collection(self):
        geo = rd.probability_grid_geojson("E2023-084925", "era5land_native", 0)
        self.assertEqual(geo["type"], "FeatureCollection")
        self.assertTrue(len(geo["features"]) > 0)
        for feature in geo["features"]:
            self.assertIn(feature["properties"]["band"], (0, 1, 2, 3))
            self.assertEqual(feature["geometry"]["type"], "Polygon")

    def test_observed_footprint_geojson_is_a_valid_feature_collection(self):
        geo = rd.observed_footprint_geojson("E2023-084925", 0)
        self.assertEqual(geo["type"], "FeatureCollection")
        self.assertTrue(len(geo["features"]) > 0)
        self.assertEqual(geo["features"][0]["geometry"]["type"], "Polygon")

    def test_wind_arrow_every_source_resolves_to_a_real_observation(self):
        time_utc = rd.overpass_time_utc("E2023-084925", 0)
        for source in ("era5land_native", "era5_025", "best_match"):
            arrow = rd.wind_arrow("E2023-084925", source, time_utc)
            self.assertTrue(0 <= arrow["direction_deg"] < 360)
            self.assertGreaterEqual(arrow["speed_ms"], 0)


if __name__ == "__main__":
    unittest.main()
