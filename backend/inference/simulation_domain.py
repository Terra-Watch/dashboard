"""Geometry of the development simulation domain (no third-party imports).

The domain is a ROWS x COLS grid of CELL_SIZE_M cells centred on the demo
origin. Row 0 is the northern edge, column 0 the western edge. The ignition
cell is derived from a requested coordinate, and a request outside the
domain is rejected rather than moved to the centre.

The same metric-to-degree conversion is used by
frontend/src/lib/simulationGeometry.ts to place the overlay.
"""
from __future__ import annotations

import math

ROWS = COLS = 40
CELL_SIZE_M = 30
ORIGIN_LATITUDE = 21.867894
ORIGIN_LONGITUDE = 86.500688
MIN_DURATION_HOURS = 1
# The staged weather slice is repeated to fill the timeline; the demo bundle
# and its frame count are defined for at most 48 hourly steps.
MAX_DURATION_HOURS = 48


class RequestOutsideDomain(ValueError):
    pass


def metres_per_degree(latitude: float) -> tuple[float, float]:
    """Metres per degree of (latitude, longitude) on WGS84 at `latitude`."""
    phi = math.radians(latitude)
    per_lat = 111132.92 - 559.82 * math.cos(2 * phi) + 1.175 * math.cos(4 * phi)
    per_lon = 111412.84 * math.cos(phi) - 93.5 * math.cos(3 * phi)
    return per_lat, per_lon


def domain_bounds(latitude: float = ORIGIN_LATITUDE, longitude: float = ORIGIN_LONGITUDE, rows: int = ROWS, cols: int = COLS, cell_size_m: float = CELL_SIZE_M) -> dict[str, float]:
    per_lat, per_lon = metres_per_degree(latitude)
    half_lat = rows * cell_size_m / 2 / per_lat
    half_lon = cols * cell_size_m / 2 / per_lon
    return {"west": longitude - half_lon, "south": latitude - half_lat, "east": longitude + half_lon, "north": latitude + half_lat}


def validate_duration(duration_hours: int) -> int:
    if isinstance(duration_hours, bool) or not isinstance(duration_hours, int) or not MIN_DURATION_HOURS <= duration_hours <= MAX_DURATION_HOURS:
        raise RequestOutsideDomain(f"duration_hours must be a whole number from {MIN_DURATION_HOURS} to {MAX_DURATION_HOURS}.")
    return duration_hours


def locate_ignition(latitude: float, longitude: float) -> tuple[int, int]:
    """Return the 0-based (row, col) of the cell containing the point."""
    if not (math.isfinite(latitude) and math.isfinite(longitude)):
        raise RequestOutsideDomain("Latitude and longitude must be finite numbers.")
    bounds = domain_bounds()
    if not (bounds["west"] <= longitude <= bounds["east"] and bounds["south"] <= latitude <= bounds["north"]):
        raise RequestOutsideDomain(
            f"The point is outside the {COLS * CELL_SIZE_M} m x {ROWS * CELL_SIZE_M} m simulation domain "
            f"(latitude {bounds['south']:.5f} to {bounds['north']:.5f}, longitude {bounds['west']:.5f} to {bounds['east']:.5f})."
        )
    per_lat, per_lon = metres_per_degree(ORIGIN_LATITUDE)
    # The epsilon keeps the exact centre (a cell boundary) on the cell the demo has always used.
    row = math.floor((bounds["north"] - latitude) * per_lat / CELL_SIZE_M + 1e-9)
    col = math.floor((longitude - bounds["west"]) * per_lon / CELL_SIZE_M + 1e-9)
    return min(max(row, 0), ROWS - 1), min(max(col, 0), COLS - 1)


def ignition_ncell(row: int, col: int) -> int:
    """Cell2Fire's 1-based row-major cell number."""
    return row * COLS + col + 1
