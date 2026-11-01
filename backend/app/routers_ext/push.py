"""Turn alerts on or off for this phone."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text

from ..core.regions import state_names
from ..core.security import current_redesign_user, require_csrf
from ..database.session import engine
from ..services import push

router = APIRouter(prefix='/api/push', tags=['push'])


class Keys(BaseModel):
    p256dh: str = Field(min_length=10, max_length=200)
    auth: str = Field(min_length=10, max_length=100)


class Subscribe(BaseModel):
    endpoint: str = Field(min_length=20, max_length=1000, pattern=r'^https://')
    keys: Keys
    state: str = Field(min_length=2, max_length=2)


class Unsubscribe(BaseModel):
    endpoint: str = Field(min_length=20, max_length=1000)


@router.get('/config')
def config(user: dict = Depends(current_redesign_user)) -> dict:
    return {'enabled': push.enabled(), 'public_key': push.public_key() if push.enabled() else None}


@router.post('/subscribe', status_code=201, dependencies=[Depends(require_csrf)])
def subscribe(payload: Subscribe, user: dict = Depends(current_redesign_user)) -> dict:
    if not push.enabled():
        raise HTTPException(status_code=503, detail='Alerts on this phone are not switched on yet')
    state = payload.state.upper()
    if state not in state_names():
        raise HTTPException(status_code=422, detail='Choose a state')
    with engine.begin() as db:
        db.execute(text('''INSERT INTO resq_push_subscriptions (user_id,endpoint,p256dh,auth,state) VALUES (:u,:e,:p,:a,:s)
            ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id,p256dh=EXCLUDED.p256dh,auth=EXCLUDED.auth,state=EXCLUDED.state'''),
                   {'u': int(user['id']), 'e': payload.endpoint, 'p': payload.keys.p256dh, 'a': payload.keys.auth, 's': state})
    return {'subscribed': True, 'state': state}


@router.post('/unsubscribe', dependencies=[Depends(require_csrf)])
def unsubscribe(payload: Unsubscribe, user: dict = Depends(current_redesign_user)) -> dict:
    with engine.begin() as db:
        db.execute(text('DELETE FROM resq_push_subscriptions WHERE endpoint=:e AND user_id=:u'), {'e': payload.endpoint, 'u': int(user['id'])})
    return {'subscribed': False}
