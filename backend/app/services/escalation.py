"""Escalate reports nobody has acted on.

A report still marked "reported", with no officer assigned, after REPORT_ESCALATION_MINUTES is brought to the lead
(incident commanders in scope, then administrators). The interval comes only from configuration: unset means off.
Each incident is escalated once, and the escalation is on its timeline.
"""
import os

from sqlalchemy import text

from ..database.session import engine
from . import audit_log
from .alert_service import generate_alert


def escalation_minutes() -> float | None:
    try:
        value = float(os.environ['REPORT_ESCALATION_MINUTES'])
    except (KeyError, ValueError):
        return None
    return value if value > 0 else None


def lead_recipients(state: str | None) -> list[int]:
    with engine.connect() as db:
        admins = db.execute(text("SELECT id FROM resq_users WHERE role='admin' AND deactivated_at IS NULL")).scalars().all()
        leads = db.execute(text('''SELECT u.id FROM resq_users u JOIN resq_user_scopes s ON s.user_id=u.id
            WHERE u.role='incident_commander' AND u.deactivated_at IS NULL AND s.state=:state'''), {'state': state}).scalars().all() if state else []
    return sorted({int(i) for i in [*admins, *leads]})


def escalate_unattended() -> list[int]:
    """Returns the ids of incidents escalated by this run."""
    minutes = escalation_minutes()
    if minutes is None:
        return []
    with engine.connect() as db:
        rows = db.execute(text('''SELECT i.id,i.state FROM resq_incidents i
            WHERE i.status='reported' AND i.created_at < now() - make_interval(secs => :secs)
              AND NOT EXISTS (SELECT 1 FROM resq_incident_assignments a WHERE a.incident_id=i.id AND a.status<>'cancelled')
              AND NOT EXISTS (SELECT 1 FROM resq_audit_log l WHERE l.entity_type='incident' AND l.entity_id=i.id::text AND l.action='report_escalated')
            ORDER BY i.created_at'''), {'secs': minutes * 60}).mappings().all()
    done: list[int] = []
    for row in rows:
        for recipient in lead_recipients(row['state']):
            generate_alert(kind='report_unattended', severity='warning', state=row['state'], entity_type='incident', entity_id=str(row['id']), user_id=recipient,
                           message=f'Report #{row["id"]} has had no officer assigned for {int(minutes)} minutes.')
        audit_log.write_audit_log(action='report_escalated', entity_type='incident', entity_id=str(row['id']), metadata={'after_minutes': minutes})
        done.append(int(row['id']))
    return done
