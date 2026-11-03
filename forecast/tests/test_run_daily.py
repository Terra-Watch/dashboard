import os, sys, tempfile, unittest
from unittest import mock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "live"))
import run_daily  # noqa: E402


class Marker(unittest.TestCase):
    def test_marker_only_after_a_finished_run(self):
        with tempfile.TemporaryDirectory() as work, mock.patch.object(run_daily, "WORK", work), mock.patch.object(run_daily, "load_env_file"):
            os.makedirs(f"{work}/runs/2026-11-03")
            with mock.patch.object(run_daily, "once", side_effect=RuntimeError("boom")), mock.patch.dict(os.environ, {"RUN_ATTEMPTS": "1"}):
                self.assertEqual(run_daily.main(["x", "2026-11-03"]), 1)
            self.assertFalse(os.path.exists(f"{work}/runs/2026-11-03/imported.ok"))
            with mock.patch.object(run_daily, "once"):
                self.assertEqual(run_daily.main(["x", "2026-11-03"]), 0)
            self.assertTrue(os.path.exists(f"{work}/runs/2026-11-03/imported.ok"))


if __name__ == "__main__": unittest.main()
