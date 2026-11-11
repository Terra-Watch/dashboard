"""The area forecast turns cell scores into chances, levels and places; calibration and areas are given. Run: python -m unittest tests.test_area_forecast (from website/forecast)."""
import os, sys, unittest
import numpy as np, pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "live"))
import area_forecast as AF  # noqa: E402

LEVELS = {"version": "t", "label": "a fire detection", "block_deg": 0.5,
          "levels": [{"id": "none", "min_chance": 0.0}, {"id": "moderate", "min_chance": 0.10}, {"id": "high", "min_chance": 0.30}, {"id": "extreme", "min_chance": 0.60}],
          "actions": [{"id": "warn", "min_chance": 0.1, "text": "x"}],
          "cell_calibration": {"x": [0.0, 0.5, 1.0], "y": [0.0, 0.5, 1.0]}, "area_calibration": {"x": [0.0, 1.0], "y": [0.0, 1.0]},
          "blocks": [{"id": 40170, "lat": 20.2, "lon": 85.2, "lat0": 20.0, "lon0": 85.0, "cells": 4, "state": "OD", "forest": 0.5}, {"id": 42171, "lat": 21.2, "lon": 85.7, "lat0": 21.0, "lon0": 85.5, "cells": 4, "state": "OD", "forest": 0.5}],
          "usual": {"40170": {"11": [1.5, 0.4]}}, "state_reliability": {"OD": True}}


def scores(a, b):
    rows = [(i, "OD", 20.1 + 0.1 * (i % 2), 85.1 + 0.1 * (i // 2), a) for i in range(4)] + [(10 + i, "OD", 21.1 + 0.1 * (i % 2), 85.6 + 0.1 * (i // 2), b) for i in range(4)]
    return pd.DataFrame(rows, columns=["cell_id", "state", "lat", "lon", "score"])


class AreaForecastTests(unittest.TestCase):
    def test_levels_follow_the_chance_and_scores_are_not_exported(self):
        out = AF.build("2025-03-15", scores(0.9, 0.01), LEVELS)
        by = {a["id"]: a for a in out["areas"]}
        self.assertEqual(by[40170]["level"], "extreme"); self.assertEqual(by[42171]["level"], "none")
        self.assertNotIn("score", str(out).lower().replace("scored", "")); self.assertAlmostEqual(by[40170]["expected_fires"], 3.6, places=2)
        self.assertEqual(out["areas"][0]["id"], 40170)                                     # highest level first
        self.assertEqual(out["summary"]["extreme"], 1)

    def test_independent_cells_add_up_to_the_area_chance(self):
        a = AF.build("2025-03-15", scores(0.5, 0.0), LEVELS)["areas"][0]; self.assertAlmostEqual(a["chance"], 1 - 0.5 ** 4, places=3)

    def test_usual_for_the_week_and_the_change_since_yesterday(self):
        first = AF.build("2025-03-14", scores(0.5, 0.0), LEVELS); second = AF.build("2025-03-15", scores(0.9, 0.0), LEVELS, previous=first)
        a = next(x for x in second["areas"] if x["id"] == 40170)
        self.assertEqual(a["usual_fires"], 1.5); self.assertGreater(a["change"], 0)                  # ISO week 11 of 2025
        self.assertIsNone(next(x for x in second["areas"] if x["id"] == 42171)["usual_fires"])

    def test_places_to_look_come_with_a_named_place_inside_reach(self):
        places = pd.DataFrame({"name": ["Kendu"], "kind": ["village"], "lat": [20.12], "lon": [85.12]})
        a = AF.build("2025-03-15", scores(0.9, 0.0), LEVELS, places=places)["areas"][0]
        self.assertEqual(len(a["look"]), 4); self.assertEqual(a["look"][0]["place"]["name"], "Kendu"); self.assertEqual(a["name"], "near Kendu")
        far = AF.build("2025-03-15", scores(0.9, 0.0), LEVELS, places=pd.DataFrame({"name": ["Far"], "kind": ["village"], "lat": [30.0], "lon": [75.0]}))["areas"][0]
        self.assertIsNone(far["look"][0]["place"]); self.assertEqual(far["name"], "OD area 40170")

    def test_the_outcome_counts_areas_with_a_detected_fire(self):
        out = AF.build("2025-03-15", scores(0.9, 0.01), LEVELS, detected=pd.DataFrame({"cell_id": [1]}))
        self.assertEqual(out["outcome"], {"areas_with_fire": 1, "in_high_or_extreme": 1, "areas_rated_high_or_extreme": 1, "of_those_with_fire": 1})
        nxt = AF.build("2025-03-16", scores(0.9, 0.01), LEVELS, previous=out); self.assertEqual(nxt["yesterday"]["areas_with_fire"], 1)

    def test_a_none_area_has_no_places_list(self):
        self.assertNotIn("look", next(a for a in AF.build("2025-03-15", scores(0.9, 0.0), LEVELS)["areas"] if a["level"] == "none"))


class JobTests(unittest.TestCase):
    def test_a_run_becomes_an_area_forecast_with_yesterdays_record(self):
        import json, tempfile
        import area_forecast_job as J
        with tempfile.TemporaryDirectory() as w:
            runs = os.path.join(w, "runs"); levels = os.path.join(w, "levels.json"); json.dump(LEVELS, open(levels, "w"))
            cells = pd.DataFrame({"cell_id": list(range(4)) + list(range(10, 14)), "lat": [20.1, 20.2, 20.1, 20.2, 21.1, 21.2, 21.1, 21.2], "lon": [85.1, 85.1, 85.2, 85.2, 85.6, 85.6, 85.7, 85.7]}); cells.to_parquet(os.path.join(w, "cells.parquet"))
            for d, issued, (a, b) in (("2025-03-15", "2025-03-14", (0.9, 0.01)), ("2025-03-16", "2025-03-15", (0.5, 0.01))):
                rd = os.path.join(runs, issued); os.makedirs(rd); sc = scores(a, b); sc.to_parquet(os.path.join(rd, "scores.parquet"))
                json.dump({"forecast_date": d, "model_id": "m", "model_version": "1", "issued_at": issued + "T05:00:00+00:00", "status": "complete", "coverage": {}, "degraded": [], "mode": "live"}, open(os.path.join(rd, "run.json"), "w"))
            pd.DataFrame({"cell_id": [1], "date": [pd.Timestamp("2025-03-15")], "forest": [True]}).to_parquet(os.path.join(w, "fire.parquet"))
            first = J.make(os.path.join(runs, "2025-03-14"), os.path.join(w, "cells.parquet"), os.path.join(w, "fire.parquet"), levels)
            self.assertNotIn("yesterday", first)
            second = J.make(os.path.join(runs, "2025-03-15"), os.path.join(w, "cells.parquet"), os.path.join(w, "fire.parquet"), levels)
            self.assertEqual(second["yesterday"], {"date": "2025-03-15", "areas_with_fire": 1, "in_high_or_extreme": 1, "areas_rated_high_or_extreme": 1, "of_those_with_fire": 1})
            self.assertTrue(os.path.isfile(os.path.join(runs, "2025-03-15", "area_forecast.json")))


if __name__ == "__main__":
    unittest.main()
