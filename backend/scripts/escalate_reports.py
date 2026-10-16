"""Bring reports that nobody has acted on to the lead. Run on a schedule (for example every few minutes).

Usage: python -m scripts.escalate_reports
Needs REPORT_ESCALATION_MINUTES; without it nothing is escalated.
"""
from app.services.escalation import escalate_unattended, escalation_minutes


def main() -> int:
    if escalation_minutes() is None:
        print('REPORT_ESCALATION_MINUTES is not set; nothing escalated')
        return 0
    done = escalate_unattended()
    print(f'Escalated {len(done)} report(s)')
    return len(done)


if __name__ == '__main__':
    main()
