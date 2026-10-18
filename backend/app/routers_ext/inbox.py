"""The signed-in person's own notifications. Reading and marking read only ever touch the caller's own rows."""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..core.security import current_redesign_user, require_csrf
from ..database.session import engine

router = APIRouter(prefix='/api/inbox', tags=['inbox'])


class MarkRead(BaseModel):
    ids: list[int] | None = Field(None, max_length=200)
    all: bool = False


@router.get('')
def inbox(limit: int = Query(30, ge=1, le=100), user: dict = Depends(current_redesign_user)) -> dict:
    uid = int(user['id'])
    with engine.connect() as db:
        rows = db.execute(text('''SELECT id,kind,message,severity,state,entity_type,entity_id,read,created_at FROM resq_alerts
            WHERE user_id=:u AND status<>'resolved' ORDER BY created_at DESC LIMIT :n'''), {'u': uid, 'n': limit}).mappings().all()
        unread = db.execute(text("SELECT count(*) FROM resq_alerts WHERE user_id=:u AND read=false AND status<>'resolved'"), {'u': uid}).scalar() or 0
    return {'items': [dict(r) for r in rows], 'unread': int(unread)}


@router.post('/read', dependencies=[Depends(require_csrf)])
def mark_read(payload: MarkRead, user: dict = Depends(current_redesign_user)) -> dict:
    uid = int(user['id'])
    with engine.begin() as db:
        if payload.all:
            changed = db.execute(text('UPDATE resq_alerts SET read=true WHERE user_id=:u AND read=false'), {'u': uid}).rowcount
        elif payload.ids:
            changed = db.execute(text('UPDATE resq_alerts SET read=true WHERE user_id=:u AND id=ANY(:ids) AND read=false'), {'u': uid, 'ids': payload.ids}).rowcount
        else:
            changed = 0
    return {'marked': changed}
