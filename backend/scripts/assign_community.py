"""Put people in a forest community: python scripts/assign_community.py --slug bolampatti --email ranger.dev@terrawatch.local [--email ...] [--scope TN]

Rangers and Control Room staff are placed by hand (a citizen joins by reporting from inside the circle). --scope also gives the person that state in their
region scope, so a Tamil Nadu community's reports are visible to them.
"""
import argparse, sys
from pathlib import Path
from sqlalchemy import text
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database.session import engine, init_db  # noqa: E402

ap = argparse.ArgumentParser(); ap.add_argument('--slug', required=True); ap.add_argument('--email', action='append', required=True); ap.add_argument('--scope')
a = ap.parse_args(); init_db()
with engine.begin() as db:
    c = db.execute(text('SELECT id,name FROM resq_communities WHERE slug=:s'), {'s': a.slug}).mappings().first()
    if not c: sys.exit(f'no community {a.slug!r}')
    for email in a.email:
        uid = db.execute(text('UPDATE resq_users SET community_id=:c WHERE email=:e RETURNING id'), {'c': c['id'], 'e': email.lower()}).scalar()
        if uid is None: print('not found:', email); continue
        if a.scope: db.execute(text('INSERT INTO resq_user_scopes (user_id,state) VALUES (:u,:s) ON CONFLICT DO NOTHING'), {'u': uid, 's': a.scope})
        print('placed', email, 'in', c['name'])
