from datetime import datetime, timedelta, timezone
import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from .config import RESQ_SECRET_KEY

bearer = HTTPBearer(auto_error=False)

def make_token(user_id: int, role: str) -> str:
    payload = {'sub': str(user_id), 'role': role, 'exp': datetime.now(timezone.utc) + timedelta(hours=12)}
    return jwt.encode(payload, RESQ_SECRET_KEY, algorithm='HS256')

def current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> dict[str, object]:
    if not credentials:
        raise HTTPException(status_code=401, detail='Authentication required')
    try:
        payload = jwt.decode(credentials.credentials, RESQ_SECRET_KEY, algorithms=['HS256'])
        return {'id': int(payload['sub']), 'role': payload['role']}
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise HTTPException(status_code=401, detail='Session expired') from exc

def require_write(user: dict[str, object] = Depends(current_user)) -> dict[str, object]:
    if user['role'] not in {'admin', 'officer'}:
        raise HTTPException(status_code=403, detail='This role cannot make changes')
    return user
