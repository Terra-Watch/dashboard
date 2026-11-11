"""Detection groups: known sources and outside-forest detections are set apart, weak isolated ones are unconfirmed, a detection seen again on a later pass is promoted, and nothing is dropped.
Run from website/forecast: python -m unittest tests.test_detection_groups"""
import os, sys, unittest
import numpy as np, pandas as pd

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "live"))
import detection_groups as G  # noqa: E402
import post_hotspot_quality as P  # noqa: E402


def rows(**cols):
    n = len(next(iter(cols.values())))
    base = {"in_forest": [True] * n, "bnd333": [1.0] * n, "p_scar": [0.5] * n, "ind_1km": [False] * n, "px_prior_offseason_days_365": [0] * n}
    base.update(cols); return pd.DataFrame(base)


class GroupTests(unittest.TestCase):
    def test_each_detection_gets_one_group_and_the_reasons(self):
        d = rows(p_scar=[0.6, 0.05, 0.6, 0.6, 0.6, np.nan], ind_1km=[False, False, True, False, False, False], px_prior_offseason_days_365=[0, 0, 0, 5, 0, 0],
                 in_forest=[True, True, True, True, False, True], bnd333=[1, 1, 1, 1, 0, 1])
        g, r = G.classify(d)
        self.assertEqual(list(g), ["likely", "unconfirmed", "known_source", "known_source", "outside_forest", "unconfirmed"])
        self.assertEqual(r[1], ["isolated_weak"]); self.assertEqual(r[2], ["industrial_near"]); self.assertEqual(r[3], ["persistent_source"]); self.assertEqual(r[4], ["outside_forest"]); self.assertEqual(r[5], ["not_scored"])

    def test_a_known_source_outranks_a_high_score_and_a_missing_score_is_never_hidden(self):
        g, _ = G.classify(rows(p_scar=[0.99, np.nan], ind_1km=[True, False])); self.assertEqual(list(g), ["known_source", "unconfirmed"])

    def test_a_half_forest_footprint_is_the_boundary(self):
        g, _ = G.classify(rows(bnd333=[0.49, 0.5])); self.assertEqual(list(g), ["outside_forest", "likely"])

    def test_an_unconfirmed_detection_seen_again_on_a_later_pass_becomes_likely(self):
        d = pd.DataFrame({"acq_datetime": pd.to_datetime(["2026-11-05 07:00", "2026-11-05 19:00", "2026-11-05 07:30"], utc=True), "latitude": [20.0, 20.004, 25.0], "longitude": [80.0, 80.004, 80.0]})
        g, r = G.classify(rows(p_scar=[0.05, 0.05, 0.05])); g2, r2 = G.promote_seen_again(d, g, r)
        self.assertEqual(list(g2), ["likely", "unconfirmed", "unconfirmed"])               # the first was seen again 12 h later; the later one and the far one were not
        self.assertEqual(r2[0], ["seen_again"]); self.assertEqual(r2[2], ["isolated_weak"])

    def test_a_known_source_is_not_promoted_by_being_seen_again(self):
        d = pd.DataFrame({"acq_datetime": pd.to_datetime(["2026-11-05 07:00", "2026-11-05 19:00"], utc=True), "latitude": [20.0, 20.0], "longitude": [80.0, 80.0]})
        g, r = G.classify(rows(p_scar=[0.05, 0.05], ind_1km=[True, True])); g2, _ = G.promote_seen_again(d, g, r); self.assertEqual(list(g2), ["known_source", "known_source"])

    def test_the_post_has_the_key_fields_and_every_row_of_the_feed(self):
        d = pd.DataFrame({"satellite": ["VIIRS_SNPP_NRT", "VIIRS_SNPP_NRT"], "date": pd.to_datetime(["2026-11-05", "2026-11-05"]), "acq_time": [705.0, 1905.0], "latitude": [20.0, 21.0], "longitude": [80.0, 81.0],
                          "group": ["likely", "outside_forest"], "p_scar": [0.61234, np.nan], "reasons": [[], ["outside_forest"]]})
        out = P.payload(d)
        self.assertEqual(out[0], {"satellite": "VIIRS_SNPP_NRT", "acq_date": "2026-11-05", "acq_time": "0705", "latitude": 20.0, "longitude": 80.0, "group": "likely", "p_scar": 0.6123, "reasons": []})
        self.assertIsNone(out[1]["p_scar"]); self.assertEqual(len(out), 2)


if __name__ == "__main__":
    unittest.main()
