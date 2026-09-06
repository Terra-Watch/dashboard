from typing import Any
from sqlalchemy.orm import Session

from app.models.security import AuditLog


def record_audit(db: Session, actor_id, action: str, target_type: str, target_id: str | None = None, details: dict[str, Any] | None = None) -> None:
    db.add(AuditLog(actor_id=actor_id, action=action, target_type=target_type, target_id=target_id, details=details))
