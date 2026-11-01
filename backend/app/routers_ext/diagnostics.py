"""The system check, for administrators and the Control Room."""
import os

from fastapi import APIRouter, Depends, HTTPException, Query

from ..core.security import current_redesign_user
from ..services import diagnostics

router = APIRouter(prefix='/api/ops', tags=['ops'])


@router.get('/diagnostics')
async def run_diagnostics(deep: bool = Query(False), user: dict = Depends(current_redesign_user)) -> dict:
    if user.get('role') not in {'admin', 'control_room_operator', 'incident_commander'}:
        raise HTTPException(status_code=403, detail='Control Room access required')
    findings = diagnostics.config_findings(os.environ) + await diagnostics.live_findings(os.environ, deep=deep and user.get('role') == 'admin')
    rank = {'fail': 0, 'warn': 1, 'ok': 2}
    findings.sort(key=lambda item: rank[item['level']])
    return {'summary': {level: sum(1 for f in findings if f['level'] == level) for level in ('fail', 'warn', 'ok')}, 'findings': findings}
