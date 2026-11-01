"""Which Indian state or union territory a point is in. The server decides this; a state sent by a client is never trusted."""
import json
from functools import lru_cache
from pathlib import Path

from shapely.geometry import Point, shape
from shapely.prepared import prep

DATA = Path(__file__).resolve().parents[1] / "data" / "india_states.json"
SLACK_DEG = 0.05  # about 5 km: the outlines are simplified, so a point on the coast or border may fall just outside its polygon


@lru_cache(maxsize=1)
def _states() -> tuple[tuple[str, str, object, object], ...]:
    return tuple((s["code"], s["name"], shape(s["geometry"]), prep(shape(s["geometry"]))) for s in json.loads(DATA.read_text()))


def state_names() -> dict[str, str]:
    return {code: name for code, name, _, _ in _states()}


def state_at(lat: float, lon: float) -> str | None:
    """The state or union-territory code containing the point, the nearest within about 5 km, or None outside India."""
    point = Point(lon, lat)
    for code, _, _, prepared in _states():
        if prepared.contains(point):
            return code
    near = min(((geometry.distance(point), code) for code, _, geometry, _ in _states()), default=(SLACK_DEG + 1, None))
    return near[1] if near[0] <= SLACK_DEG else None
