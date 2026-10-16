"""Public community discussion, deliberately separate from incident reporting."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text

from ..contracts.schemas import CommunityCommentRequest, CommunityMessageRequest, CommunityPostRequest, CommunityReportRequest
from ..core.security import current_redesign_user, require_csrf
from ..database.session import engine

router = APIRouter(prefix='/api/community', tags=['community'])
PUBLIC_ROLES = {'citizen', 'field_crew', 'control_room_operator', 'incident_commander', 'admin'}


def community_user(user: dict = Depends(current_redesign_user)) -> dict:
    if user.get('role') not in PUBLIC_ROLES:
        raise HTTPException(status_code=403, detail='A permitted TerraWatch account is required')
    return user


def _clean(value: str) -> str:
    value = value.strip()
    if not value:
        raise HTTPException(status_code=422, detail='Message content cannot be empty')
    return value


def _author(row: dict) -> dict:
    return {'id': row['author_id'], 'name': row['author_name'] or 'TerraWatch member'}


def _rate_limit(db, table: str, user_id: int, minutes: int = 10, limit: int = 10) -> None:
    # Table names are fixed internal values, never user input.
    count = db.execute(text(f"SELECT count(*) FROM {table} WHERE author_id=:user_id AND created_at > now() - make_interval(mins => :minutes)"), {'user_id': user_id, 'minutes': minutes}).scalar() or 0
    if count >= limit:
        raise HTTPException(status_code=429, detail='Please wait before posting again')


@router.get('/posts')
def list_posts(archived: bool = False, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50)) -> dict:
    offset = (page - 1) * page_size
    with engine.connect() as db:
        total = db.execute(text('SELECT count(*) FROM resq_community_posts WHERE archived=:archived'), {'archived': archived}).scalar() or 0
        rows = db.execute(text('''SELECT p.id,p.content,p.archived,p.created_at,p.updated_at,p.author_id,u.name AS author_name,
            (SELECT count(*) FROM resq_community_comments c WHERE c.post_id=p.id) AS comments_count
            FROM resq_community_posts p JOIN resq_users u ON u.id=p.author_id
            WHERE p.archived=:archived ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset'''), {'archived': archived, 'limit': page_size, 'offset': offset}).mappings().all()
    return {'items': [{**dict(row), 'author': _author(dict(row))} for row in rows], 'page': page, 'page_size': page_size, 'total': total, 'has_more': offset + len(rows) < total}


@router.post('/posts', status_code=201, dependencies=[Depends(require_csrf)])
def create_post(payload: CommunityPostRequest, user: dict = Depends(community_user)) -> dict:
    content = _clean(payload.content)
    with engine.begin() as db:
        _rate_limit(db, 'resq_community_posts', int(user['id']))
        row = db.execute(text('''INSERT INTO resq_community_posts (author_id,content) VALUES (:author_id,:content)
            RETURNING id,content,archived,created_at,updated_at'''), {'author_id': user['id'], 'content': content}).mappings().one()
    return {'post': {**dict(row), 'author': {'id': user['id']}, 'comments_count': 0}, 'message': 'Community post published. It does not notify responders or create an incident.'}


@router.get('/posts/{post_id}/comments')
def list_comments(post_id: int) -> dict:
    with engine.connect() as db:
        rows = db.execute(text('''SELECT c.id,c.post_id,c.content,c.created_at,c.author_id,u.name AS author_name
            FROM resq_community_comments c JOIN resq_users u ON u.id=c.author_id
            JOIN resq_community_posts p ON p.id=c.post_id WHERE c.post_id=:post_id AND p.archived=false ORDER BY c.created_at ASC LIMIT 100'''), {'post_id': post_id}).mappings().all()
    return {'items': [{**dict(row), 'author': _author(dict(row))} for row in rows]}


@router.post('/posts/{post_id}/comments', status_code=201, dependencies=[Depends(require_csrf)])
def create_comment(post_id: int, payload: CommunityCommentRequest, user: dict = Depends(community_user)) -> dict:
    content = _clean(payload.content)
    with engine.begin() as db:
        if not db.execute(text('SELECT 1 FROM resq_community_posts WHERE id=:id AND archived=false'), {'id': post_id}).scalar():
            raise HTTPException(status_code=404, detail='Community post not found')
        _rate_limit(db, 'resq_community_comments', int(user['id']))
        row = db.execute(text('''INSERT INTO resq_community_comments (post_id,author_id,content) VALUES (:post_id,:author_id,:content)
            RETURNING id,post_id,content,created_at'''), {'post_id': post_id, 'author_id': user['id'], 'content': content}).mappings().one()
    return {'comment': {**dict(row), 'author': {'id': user['id']}}}


@router.get('/chat')
def list_chat(before_id: int | None = Query(None, gt=0), limit: int = Query(50, ge=1, le=50), user: dict = Depends(community_user)) -> dict:
    params = {'limit': limit}
    clause = ''
    if before_id:
        clause = 'WHERE m.id < :before_id'
        params['before_id'] = before_id
    with engine.connect() as db:
        rows = db.execute(text(f'''SELECT m.id,m.content,m.created_at,m.author_id,u.name AS author_name
            FROM resq_community_messages m JOIN resq_users u ON u.id=m.author_id {clause}
            ORDER BY m.id DESC LIMIT :limit'''), params).mappings().all()
    items = [{**dict(row), 'author': _author(dict(row))} for row in reversed(rows)]
    return {'items': items, 'has_more': len(rows) == limit, 'delivery': 'polling'}


@router.post('/chat', status_code=201, dependencies=[Depends(require_csrf)])
def create_chat_message(payload: CommunityMessageRequest, user: dict = Depends(community_user)) -> dict:
    content = _clean(payload.content)
    with engine.begin() as db:
        _rate_limit(db, 'resq_community_messages', int(user['id']), limit=20)
        row = db.execute(text('''INSERT INTO resq_community_messages (author_id,content) VALUES (:author_id,:content)
            RETURNING id,content,created_at'''), {'author_id': user['id'], 'content': content}).mappings().one()
    return {'message': {**dict(row), 'author': {'id': user['id']}}}


@router.post('/posts/{post_id}/report', status_code=201, dependencies=[Depends(require_csrf)])
def report_post(post_id: int, payload: CommunityReportRequest, user: dict = Depends(community_user)) -> dict:
    reason = _clean(payload.reason)
    with engine.begin() as db:
        if not db.execute(text('SELECT 1 FROM resq_community_posts WHERE id=:id'), {'id': post_id}).scalar():
            raise HTTPException(status_code=404, detail='Community post not found')
        db.execute(text('INSERT INTO resq_community_reports (reporter_id,post_id,reason) VALUES (:user_id,:post_id,:reason)'), {'user_id': user['id'], 'post_id': post_id, 'reason': reason})
    return {'status': 'received', 'message': 'The community report was recorded for moderation. It does not create an incident.'}


@router.patch('/posts/{post_id}/archive', dependencies=[Depends(require_csrf)])
def archive_post(post_id: int, user: dict = Depends(community_user)) -> dict:
    if user.get('role') not in {'admin', 'control_room_operator'}:
        raise HTTPException(status_code=403, detail='Community moderation permission required')
    with engine.begin() as db:
        row = db.execute(text('UPDATE resq_community_posts SET archived=true,updated_at=now() WHERE id=:id RETURNING id,archived'), {'id': post_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail='Community post not found')
    return {'post': dict(row), 'message': 'Post archived as a historical community item. It is not current fire activity.'}
