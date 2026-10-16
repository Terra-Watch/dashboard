"""Who is told about an incident: staff whose scope covers the incident's state, plus administrators.

Fail closed: an incident with no state is routed to administrators only, never broadcast to every Control Room user.
"""
from sqlalchemy import text

from ..database.session import engine

STAFF_ROLES = ('control_room_operator', 'incident_commander', 'officer')


def incident_staff_recipients(state: str | None) -> list[int]:
    with engine.connect() as db:
        admins = db.execute(text("SELECT id FROM resq_users WHERE role='admin'")).scalars().all()
        scoped = []
        if state:
            scoped = db.execute(text('''SELECT u.id FROM resq_users u JOIN resq_user_scopes s ON s.user_id=u.id
                WHERE u.role = ANY(:roles) AND s.state=:state'''), {'roles': list(STAFF_ROLES), 'state': state}).scalars().all()
    return sorted({int(item) for item in [*admins, *scoped]})
