"""Cron entry point: python -m scripts.ingest_feeds --bbox W,S,E,N --days 2

Reads FIRMS_MAP_KEY from the environment; prints counts only (never the key or URL).
"""
import argparse
import sys

from app.database.session import init_db
from app.services.feeds import FeedError, firms


def main(argv=None) -> int:
    p = argparse.ArgumentParser(description="Ingest FIRMS hotspots for a bounding box")
    p.add_argument("--bbox", required=True, help="W,S,E,N in degrees")
    p.add_argument("--days", type=int, default=1, help="1..5")
    args = p.parse_args(argv)
    try:
        bbox = [float(v) for v in args.bbox.split(",")]
        init_db()
        result = firms.fetch_area(bbox, args.days)
    except ValueError:
        print("error: --bbox must be four numbers W,S,E,N", file=sys.stderr)
        return 2
    except FeedError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    print(f"fetched={result['fetched']} inserted={result['inserted']} errors={len(result['errors'])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
