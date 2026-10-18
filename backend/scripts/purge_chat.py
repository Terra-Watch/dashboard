"""Delete community chat messages past their room's retention_days. Rooms without retention_days keep everything.

Usage: python -m scripts.purge_chat
"""
from app.database.session import engine
from app.services import audit_log
from app.services.community_rules import purge_expired_messages


def main() -> int:
    with engine.begin() as db:
        deleted = purge_expired_messages(db)
        if deleted:
            audit_log.write_audit_log(action='community_chat_purged', entity_type='community_chat', entity_id='retention', metadata={'deleted': deleted}, connection=db)
    print(f'Purged {deleted} expired chat message(s)')
    return deleted


if __name__ == '__main__':
    main()
