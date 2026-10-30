"""Which supported state a point is in. The server decides this; a state sent by a client is never trusted."""
from ..services.ingest import STATE_BOXES
from .permissions import SUPPORTED_STATES


def state_at(lat: float, lon: float) -> str | None:
    """The supported state whose box contains the point (the smaller box where boxes overlap), or None outside all of them.
    shortcut: boxes are rectangles, so points near a border can land in the neighbour; replace with state polygons when they are bundled."""
    inside = [(abs((e - w) * (n - s)), code) for code, (w, s, e, n) in STATE_BOXES.items()
              if code in SUPPORTED_STATES and w <= lon <= e and s <= lat <= n]
    return min(inside)[1] if inside else None
