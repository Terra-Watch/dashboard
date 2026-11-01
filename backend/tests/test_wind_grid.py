"""Wind grid for the animated wind layer: one request, correct u/v signs, cached, bad input refused."""
import sys
import unittest
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.services.feeds import FeedError, weather  # noqa: E402


def _client(speed, direction, calls):
    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(1)
        n = len(request.url.params["latitude"].split(","))
        return httpx.Response(200, json=[{"current": {"time": "2026-11-01T12:00", "wind_speed_10m": speed, "wind_direction_10m": direction}} for _ in range(n)])
    return httpx.Client(transport=httpx.MockTransport(handler))


class WindGridTests(unittest.TestCase):
    def setUp(self):
        weather._GRID_CACHE.clear()

    def test_west_wind_blows_east_and_north_wind_blows_south(self):
        g = weather.fetch_wind_grid(10, 70, 20, 80, 3, _client(5.0, 270.0, []))
        self.assertAlmostEqual(g["u"][0][0], 5.0, places=2); self.assertAlmostEqual(g["v"][0][0], 0.0, places=2)
        g = weather.fetch_wind_grid(11, 71, 21, 81, 3, _client(5.0, 0.0, []))
        self.assertAlmostEqual(g["v"][1][1], -5.0, places=2)

    def test_one_request_serves_the_whole_grid_and_is_cached(self):
        calls = []
        c = _client(3.0, 90.0, calls)
        a = weather.fetch_wind_grid(10, 70, 20, 80, 4, c); b = weather.fetch_wind_grid(10, 70, 20, 80, 4, c)
        self.assertEqual(len(calls), 1); self.assertIs(a, b)
        self.assertEqual((len(a["lats"]), len(a["lons"]), len(a["u"]), len(a["u"][0])), (4, 4, 4, 4))

    def test_conditions_are_passed_through_and_optional(self):
        def handler(request):
            n = len(request.url.params["latitude"].split(","))
            return httpx.Response(200, json=[{"current": {"time": "2026-11-01T12:00", "wind_speed_10m": 1, "wind_direction_10m": 0, "weather_code": 63, "temperature_2m": 24.5, "precipitation": 1.2, "is_day": 0}}] * n)
        g = weather.fetch_wind_grid(10, 70, 20, 80, 3, httpx.Client(transport=httpx.MockTransport(handler)))
        self.assertEqual((g["code"][0][0], g["temp"][1][1], g["precip"][2][2], g["is_day"][0][1]), (63, 24.5, 1.2, 0))
        plain = weather.fetch_wind_grid(11, 71, 21, 81, 3, _client(2.0, 90.0, []))   # no conditions in the answer: still a valid grid
        self.assertIsNone(plain["code"][0][0]); self.assertEqual(plain["is_day"][0][0], 1)

    def test_bad_box_and_bad_response_are_refused(self):
        with self.assertRaises(FeedError): weather.fetch_wind_grid(20, 70, 10, 80, 3, _client(1, 1, []))
        bad = httpx.Client(transport=httpx.MockTransport(lambda r: httpx.Response(200, json=[{"current": {}}])))
        with self.assertRaises(FeedError): weather.fetch_wind_grid(10, 70, 20, 80, 3, bad)


if __name__ == "__main__":
    unittest.main()
