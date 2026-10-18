"""One real, small FIRMS request (Odisha, 1 day). Prints ONLY the HTTP status and the row count."""
import sys

from app.services.feeds import FeedError, firms

ODISHA = (81.3, 17.8, 87.5, 22.6)


def main() -> int:
    try:
        status, body = firms.fetch_csv(ODISHA, 1, "VIIRS_SNPP_NRT")
        rows = len(firms.parse(body, "VIIRS_SNPP_NRT")) if status == 200 else 0
    except FeedError as exc:
        print(f"error: {exc}")
        return 1
    print(f"status={status} rows={rows}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
