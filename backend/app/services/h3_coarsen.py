"""Coordinate coarsening for the public map (D-14): latitude/longitude -> H3 cell id (h3 v4)."""
import h3


def to_cell(latitude: float, longitude: float, resolution: int) -> str:
    return h3.latlng_to_cell(float(latitude), float(longitude), int(resolution))
