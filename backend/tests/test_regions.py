from app.core.regions import state_at, state_names


def test_every_state_and_union_territory_is_known():
    names = state_names()
    assert len(names) == 36 and {"OD", "TS", "UK", "CG", "DL", "AN", "LD", "LA", "JK"} <= set(names)


def test_points_across_india_resolve_to_their_state():
    cases = {(13.6154, 79.4122): "AP", (28.61, 77.21): "DL", (12.97, 77.59): "KA", (22.57, 88.36): "WB", (26.14, 91.74): "AS", (11.62, 92.73): "AN",
             (20.30, 85.82): "OD", (30.32, 78.03): "UK", (17.38, 78.48): "TS", (32.73, 74.86): "JK", (8.52, 76.94): "KL", (23.02, 72.57): "GJ"}
    for (lat, lon), code in cases.items():
        assert state_at(lat, lon) == code, (lat, lon)


def test_points_outside_india_have_no_state():
    for lat, lon in ((7.8, 80.7), (27.7, 85.3), (0.0, 0.0), (15.0, 68.0)):   # Sri Lanka, Nepal, the Atlantic, the Arabian Sea
        assert state_at(lat, lon) is None, (lat, lon)
