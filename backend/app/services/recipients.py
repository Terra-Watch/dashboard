"""Who is told about an incident: staff whose scope covers the incident's state, plus administrators.

An incident in a state that no Control Room operator or commander covers yet goes to all of them, so nothing sits unseen. Fail closed otherwise: an incident with no state
is routed to administrators only, never broadcast.
"""
from sqlalchemy import text

from ..database.session import engine

STAFF_ROLES = ('control_room_operator', 'incident_commander', 'officer')


COVERS = """(EXISTS (SELECT 1 FROM resq_user_community_scopes x WHERE x.user_id=u.id AND x.community_id=:cid)
    OR (NOT EXISTS (SELECT 1 FROM resq_user_community_scopes x WHERE x.user_id=u.id)
        AND EXISTS (SELECT 1 FROM resq_user_scopes s WHERE s.user_id=u.id AND s.state=:state)))"""


def incident_staff_recipients(state: str | None, incident_id: int | None = None, community_id: int | None = None) -> list[int]:
    """Staff to tell. When the incident has a community, people given that community (older accounts: its state) are told; otherwise the state decides."""
    with engine.connect() as db:
        admins = db.execute(text("SELECT id FROM resq_users WHERE role='admin'")).scalars().all()
        if community_id is None and incident_id is not None:
            community_id = db.execute(text('SELECT community_id FROM resq_incidents WHERE id=:i'), {'i': incident_id}).scalar()
        scoped = []
        params = {'state': state, 'cid': community_id}
        if community_id is not None and state:
            covered = db.execute(text(f"SELECT 1 FROM resq_users u WHERE u.role = ANY(:roles) AND u.deactivated_at IS NULL AND {COVERS} LIMIT 1"),
                                 {**params, 'roles': ['control_room_operator', 'incident_commander']}).first()
            if not covered:
                scoped = db.execute(text("SELECT id FROM resq_users WHERE role IN ('control_room_operator','incident_commander') AND deactivated_at IS NULL")).scalars().all()
            else:
                scoped = db.execute(text(f"SELECT u.id FROM resq_users u WHERE u.role = ANY(:roles) AND u.deactivated_at IS NULL AND {COVERS}"), {**params, 'roles': list(STAFF_ROLES)}).scalars().all()
        elif state and not db.execute(text("""SELECT 1 FROM resq_user_scopes s JOIN resq_users u ON u.id=s.user_id
                WHERE s.state=:state AND u.role = ANY(:roles) AND u.deactivated_at IS NULL LIMIT 1"""), {'state': state, 'roles': ['control_room_operator', 'incident_commander']}).first():
            scoped = db.execute(text("SELECT id FROM resq_users WHERE role IN ('control_room_operator','incident_commander') AND deactivated_at IS NULL")).scalars().all()   # nobody covers this state yet, so the whole Control Room
        elif state:
            scoped = db.execute(text('''SELECT u.id FROM resq_users u JOIN resq_user_scopes s ON s.user_id=u.id
                WHERE u.role = ANY(:roles) AND s.state=:state'''), {'roles': list(STAFF_ROLES), 'state': state}).scalars().all()
    return sorted({int(item) for item in [*admins, *scoped]})
