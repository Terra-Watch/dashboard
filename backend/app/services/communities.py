"""Forest communities: the people around one forest area. Reports, rangers and the community spaces are tied to one by place.

A report belongs to the nearest community whose circle contains its position, otherwise to none.
shortcut: a circle around a centre point, not the forest boundary itself; switch to the beat/range polygons (docs/FOREST_BOUNDARY_LAYERS_PLAN.md, P3) when more communities are added.
"""
import math

from sqlalchemy import text

SEEDS = (  # centres are the forest blocks' middle points from the Survey of India forest layer, radius in km
    ('bolampatti', 'Bolampatti forest community', 'Bolampatti Block I Reserved Forest', 'Coimbatore South, Tamil Nadu', 'TN', 10.90158, 76.90577, 10.0),
    ('bolampatti-west', 'Bolampatti West forest community', 'Bolampatti Block II Reserved Forest', 'Coimbatore, Tamil Nadu', 'TN', 10.9642, 76.7010, 8.0),
    ('bolampatti-north', 'Bolampatti North forest community', 'Bolampatti Block III Reserved Forest', 'Coimbatore North, Tamil Nadu', 'TN', 11.0338, 76.8188, 6.0),
)


def ensure(db) -> None:
    db.execute(text('''CREATE TABLE IF NOT EXISTS resq_communities (
        id SERIAL PRIMARY KEY, slug VARCHAR(40) NOT NULL UNIQUE, name VARCHAR(120) NOT NULL, forest_name VARCHAR(160) NOT NULL,
        area VARCHAR(160) NOT NULL, state VARCHAR(2) NOT NULL, latitude DOUBLE PRECISION NOT NULL, longitude DOUBLE PRECISION NOT NULL,
        radius_km DOUBLE PRECISION NOT NULL CHECK (radius_km > 0), created_at TIMESTAMPTZ NOT NULL DEFAULT now())'''))
    db.execute(text('ALTER TABLE resq_users ADD COLUMN IF NOT EXISTS community_id INTEGER REFERENCES resq_communities(id) ON DELETE SET NULL'))
    db.execute(text('ALTER TABLE resq_incidents ADD COLUMN IF NOT EXISTS community_id INTEGER REFERENCES resq_communities(id) ON DELETE SET NULL'))
    for seed in SEEDS:
        db.execute(text('INSERT INTO resq_communities (slug,name,forest_name,area,state,latitude,longitude,radius_km) VALUES (:a,:b,:c,:d,:e,:f,:g,:h) ON CONFLICT (slug) DO NOTHING'),
                   dict(zip('abcdefgh', seed)))


def _km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    p, q = math.radians(lat1), math.radians(lat2)
    a = math.sin((q - p) / 2) ** 2 + math.cos(p) * math.cos(q) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 12742.0 * math.asin(math.sqrt(a))


def at_point(db, lat: float | None, lon: float | None) -> int | None:
    """Id of the nearest community whose circle holds the point, or None."""
    if lat is None or lon is None:
        return None
    rows = db.execute(text('SELECT id,latitude,longitude,radius_km FROM resq_communities')).mappings().all()
    near = sorted((_km(lat, lon, r['latitude'], r['longitude']), r['id']) for r in rows if _km(lat, lon, r['latitude'], r['longitude']) <= r['radius_km'])
    return near[0][1] if near else None


def of_user(db, user_id: int) -> dict | None:
    row = db.execute(text('''SELECT c.id,c.slug,c.name,c.forest_name,c.area,c.state,c.latitude,c.longitude,c.radius_km
        FROM resq_users u JOIN resq_communities c ON c.id=u.community_id WHERE u.id=:id'''), {'id': user_id}).mappings().first()
    return dict(row) if row else None


def join_if_none(db, user_id: int, community_id: int | None) -> None:
    """A person who reports from inside a community and has none yet becomes a member of it."""
    if community_id:
        db.execute(text('UPDATE resq_users SET community_id=:c WHERE id=:u AND community_id IS NULL'), {'c': community_id, 'u': user_id})
