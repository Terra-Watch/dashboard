"""Station rules: smoke has to rise above the station's own normal for the hour, hold, and not be the whole range; fog does not count; sounds are announced once and by their own rules."""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services import station_rules as R  # noqa: E402

ONLINE = {"status": "online", "age_s": 30, "battery_mv": 3900}


class RulesTests(unittest.TestCase):
    def test_the_normal_is_for_the_hour_of_day_and_needs_enough_readings(self):
        rs = [(6, 10.0)] * 8 + [(7, 14.0)] * 8 + [(18, 60.0)] * 20
        self.assertEqual(R.hour_normal(rs, 6), 12.0)                         # the evening cooking smoke does not move the morning normal
        self.assertEqual(R.hour_normal(rs, 18), 60.0); self.assertIsNone(R.hour_normal(rs[:5], 6))
        self.assertEqual(R.hour_normal([(23, 8.0)] * 6 + [(0, 8.0)] * 6, 23), 8.0)       # hours wrap around midnight

    def test_how_long_the_rise_has_held(self):
        pts = [(2, 30.0), (12, 28.0), (22, 26.0), (32, 8.0)]
        self.assertEqual(R.sustained_minutes(pts, 10.0), 22); self.assertEqual(R.sustained_minutes([(2, 12.0)] + pts[1:], 10.0), 0); self.assertEqual(R.sustained_minutes(pts, 0.5), 0)

    def test_smoke_states(self):
        s = R.smoke_state
        self.assertEqual(s(12, 10, 40, 0, []), "normal"); self.assertEqual(s(30, 10, 40, 25, [1.0, 1.1, 0.9]), "rising"); self.assertEqual(s(30, 10, 40, 5, [1.0, 1.0]), "watch")
        self.assertEqual(s(30, 10, 95, 40, []), "damp"); self.assertEqual(s(30, 10, 40, 40, [2.5, 3.0, 1.0]), "haze"); self.assertEqual(s(30, None, 40, 40, []), "unknown")
        self.assertEqual(s(30, 10, 40, 40, [2.5]), "rising")                 # one neighbour is not a range: it cannot make haze

    def test_statements_put_silence_first_then_sounds_then_smoke(self):
        st = R.statement
        self.assertEqual(st({**ONLINE, "status": "offline", "age_s": 9000}, "normal")["tone"], "gap"); self.assertEqual(st({**ONLINE, "status": "never"}, "normal")["key"], "never")
        self.assertEqual(st(ONLINE, "rising", 30, [("chainsaw", 5), ("chainsaw", 12)])["key"], "chainsaw")
        self.assertEqual(st(ONLINE, "normal", 0, [("chainsaw", 5)])["key"], "normal")          # one chainsaw sound is not announced
        self.assertEqual(st(ONLINE, "rising", 30)["key"], "smoke_rising"); self.assertEqual(st(ONLINE, "haze")["tone"], "watch"); self.assertEqual(st(ONLINE, "normal", 0, [("blast", 20)])["key"], "blast")
        self.assertEqual(st(ONLINE, "normal", 0, [("fire", 20)])["tone"], "watch"); self.assertEqual(st(ONLINE, "unknown")["key"], "no_baseline")

    def test_one_notification_per_check(self):
        n = R.should_notify
        self.assertTrue(n("blast", 1, False, 0)); self.assertFalse(n("chainsaw", 1, False, 0)); self.assertTrue(n("chainsaw", 2, False, 0))
        self.assertFalse(n("fire", 1, False, 0)); self.assertTrue(n("fire", 1, True, 0)); self.assertTrue(n("fire", 1, False, 3)); self.assertFalse(n("wood", 5, True, 5))

    def test_the_worst_tone_wins(self):
        self.assertEqual(R.worst([{"tone": "ok"}, {"tone": "watch"}, {"tone": "gap"}]), "gap"); self.assertEqual(R.worst([]), "ok")


if __name__ == "__main__":
    unittest.main()


class AnnotateTests(unittest.TestCase):
    def test_statement_uses_neighbours_within_range(self):
        from app.routers_ext.stations import _annotate
        def mk(i, lon, ratio): return {"id": i, "latitude": 20.0, "longitude": lon, "status": "online", "age_s": 30, "battery_mv": 3900, "pm25": 10 * ratio, "pm25_normal": 10.0,
                                        "pm25_vs_normal": ratio, "humidity_pct": 40, "held_min": 40, "sounds_recent": []}
        a = mk(1, 80.0, 3.0); haze = [mk(2, 80.1, 3.0), mk(3, 80.2, 2.5)]; calm = [mk(4, 80.1, 1.0), mk(5, 80.2, 1.0)]
        _annotate([a], haze); self.assertEqual(a["statement"]["key"], "haze")
        a = mk(1, 80.0, 3.0); _annotate([a], calm); self.assertEqual(a["statement"]["key"], "smoke_rising")
        a = mk(1, 80.0, 3.0); _annotate([a], [mk(6, 83.0, 3.0), mk(7, 83.1, 3.0)]); self.assertEqual(a["statement"]["key"], "smoke_rising")      # stations 300 km away are not the range
