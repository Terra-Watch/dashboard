import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "live"))
from retry import retry  # noqa: E402

quiet = lambda *a, **k: None


class RetryTests(unittest.TestCase):
    def test_retries_until_it_works(self):
        calls = []
        def flaky():
            calls.append(1)
            if len(calls) < 4: raise ConnectionError("down")
            return "ok"
        self.assertEqual(retry(flaky, first_wait=0.001, ceiling=0.002, log=quiet), "ok"); self.assertEqual(len(calls), 4)

    def test_gives_up_after_the_deadline(self):
        def never(): raise ValueError("always")
        with self.assertRaises(ValueError): retry(never, deadline_s=0.05, first_wait=0.03, log=quiet)

    def test_other_errors_are_not_retried(self):
        calls = []
        def bad(): calls.append(1); raise KeyError("mine")
        with self.assertRaises(KeyError): retry(bad, retry_on=(ConnectionError,), log=quiet)
        self.assertEqual(len(calls), 1)


if __name__ == "__main__": unittest.main()
