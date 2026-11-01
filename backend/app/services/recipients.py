"""Who is told about an incident: staff whose scope covers the incident's state, plus administrators.

An incident in a state that no Control Room operator or commander covers yet goes to all of them, so nothing sits unseen. Fail closed otherwise: an incident with no state
is routed to administrators only, never broadcast.
"""
from sqlalchemy import text

from ..database.session import engine

STAFF_ROLES = ('control_room_operator', 'incident_commander', 'officer')


def incident_staff_recipients(state: str | None) -> list[int]:
    with engine.connect() as db:
        admins = db.execute(text("SELECT id FROM resq_users WHERE role='admin'")).scalars().all()
        scoped = []
        if state and not db.execute(text("""SELECT 1 FROM resq_user_scopes s JOIN resq_users u ON u.id=s.user_id
                WHERE s.state=:state AND u.role = ANY(:roles) AND u.deactivated_at IS NULL LIMIT 1"""), {'state': state, 'roles': ['control_room_operator', 'incident_commander']}).first():
            scoped = db.execute(text("SELECT id FROM resq_users WHERE role IN ('control_room_operator','incident_commander') AND deactivated_at IS NULL")).scalars().all()   # nobody covers this state yet, so the whole Control Room is told
        elif state:
            scoped = db.execute(text('''SELECT u.id FROM resq_users u JOIN resq_user_scopes s ON s.user_id=u.id
                WHERE u.role = ANY(:roles) AND s.state=:state'''), {'roles': list(STAFF_ROLES), 'state': state}).scalars().all()
    return sorted({int(item) for item in [*admins, *scoped]})
