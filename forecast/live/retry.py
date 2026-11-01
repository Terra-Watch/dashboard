"""Retry a flaky network call again and again, with a wait that grows to a ceiling, until it works or the deadline passes."""
import time


def retry(fn, *, deadline_s=7200, first_wait=5, ceiling=300, retry_on=(Exception,), log=print):
    start, wait, n = time.time(), first_wait, 0
    while True:
        try:
            return fn()
        except retry_on as e:
            n += 1
            if time.time() - start + wait > deadline_s: raise
            log(f"retry {n} after {type(e).__name__}: {str(e)[:120]} (waiting {wait}s)", flush=True) if log is print else log(f"retry {n}")
            time.sleep(wait); wait = min(ceiling, wait * 2)
