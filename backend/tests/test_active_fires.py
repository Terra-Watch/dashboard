"""Active fires: linking, passes, growth, status, places and marks, all on made-up detections."""
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import active_fires as A  # noqa: E402

T0 = datetime(2025, 4, 10, 8, 0, tzinfo=timezone.utc)
D = lambda h, lat, lon, **o: {"t": T0 + timedelta(hours=h), "lat": lat, "lon": lon, "frp": 5.0, "grp": "likely", **o}
PLACES = lambda lat, lon, r: [{"name": "Pathara", "kind": "village", "lat": 20.015, "lon": 80.0}, {"name": "Far", "kind": "village", "lat": 20.5, "lon": 80.5}]


class ActiveFireTests(unittest.TestCase):
    def test_link_by_distance_and_time(self):
        g = A.link([D(0, 20.0, 80.0), D(1, 20.004, 80.0), D(30, 20.008, 80.0), D(0, 21.0, 80.0), D(80, 20.0, 80.0)])
        self.assertEqual(sorted(len(x) for x in g), [1, 1, 3])                    # the 80 h one is a new fire; the far one is another fire; the first three chain
    def test_status_growth_and_direction(self):
        grow = [D(0, 20.0, 80.0), D(0.2, 20.002, 80.0), D(24, 20.02, 80.0), D(24.1, 20.021, 80.0)]            # second pass 2 km north of the first
        f = A.describe(grow, T0 + timedelta(hours=26), PLACES)
        self.assertEqual((f["status"], f["n_passes"], f["grew_toward"]), ("growing", 2, "N")); self.assertGreater(f["passes"][1]["n_new"], 0)
        steady = A.describe([D(0, 20.0, 80.0), D(24, 20.0, 80.0)], T0 + timedelta(hours=26)); self.assertEqual((steady["status"], steady["passes"][1]["n_new"]), ("steady", 0))
        self.assertEqual(A.describe([D(0, 20.0, 80.0)], T0 + timedelta(hours=3))["status"], "new"); self.assertEqual(A.describe(grow, T0 + timedelta(hours=60))["status"], "out")
    def test_places_use_distance_from_the_edge_and_the_side_grown_toward(self):
        f = A.describe([D(0, 20.0, 80.0), D(24, 20.012, 80.0)], T0 + timedelta(hours=25), PLACES)
        self.assertEqual([p["name"] for p in f["places"]], ["Pathara"]); self.assertLess(f["nearest"]["km"], 1.0); self.assertTrue(f["nearest"]["on_side"])
    def test_area_counts_distinct_pixels_and_geometry_does_not_repeat_cells(self):
        f = A.describe([D(0, 20.0, 80.0), D(0.1, 20.0, 80.0), D(24, 20.01, 80.0)], T0 + timedelta(hours=25), None, with_geometry=True)
        self.assertEqual(f["n_det"], 3); self.assertEqual(sum(len(p["rings"]) for p in f["footprints"]), 2); self.assertGreater(f["area_km2"], 0.2)
    def test_board_order_and_marks(self):
        dets = [D(0, 20.0, 80.0), D(12, 20.008, 80.0), D(24, 20.016, 80.0), D(23, 25.0, 85.0)]
        fires = A.build(dets, T0 + timedelta(hours=25), PLACES)
        self.assertEqual(fires[0]["status"], "growing"); self.assertEqual(len(fires), 2)
        gid = fires[0]["id"]; closed = A.build(dets, T0 + timedelta(hours=25), PLACES, marks={gid: {"status": "out", "at": T0 + timedelta(hours=25)}})
        self.assertTrue(next(f for f in closed if f["id"] == gid)["closed"])
        reopened = A.build(dets + [D(26, 20.022, 80.0)], T0 + timedelta(hours=27), PLACES, marks={gid: {"status": "out", "at": T0 + timedelta(hours=25)}})
        self.assertFalse(next(f for f in reopened if f["id"] == gid)["closed"])           # a newer detection reopens it
    def test_unconfirmed_when_no_likely_detection(self):
        self.assertEqual(A.describe([D(0, 20.0, 80.0, grp="unconfirmed")], T0)["kind"], "unconfirmed")


if __name__ == "__main__":
    unittest.main()
