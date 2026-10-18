"""Community discussion and chat, deliberately separate from incident reporting. Rules: docs/design/D5-community-posts-chat-by-role.md."""
import hashlib
import math
import os

from fastapi import APIRouter, Depends, File, HTTPException, Query, Response, UploadFile
from sqlalchemy import text

from ..contracts.schemas import (CommunityCommentRequest, CommunityEditRequest, CommunityMessageRequest, CommunityModerationDecision,
                                 CommunityPostRequest, CommunityRemovalRequest, CommunityReportRequest, CommunityRoomUpdate,
                                 CommunitySanctionRequest)
from ..core.security import current_redesign_user, optional_user, require_csrf
from ..database.session import engine
from ..services import alert_service, audit_log
from ..services import community_image_assessment as media
from ..services.community_rules import STAFF_ROLES, badge_for, emergency_hint, held_reason, public_name

router = APIRouter(prefix='/api/community', tags=['community'])
MODERATOR_ROLES = set(STAFF_ROLES)
PUBLIC_ROLES = {'citizen'} | STAFF_ROLES  # field_crew and range_officer use /api/notices instead
HELD_MESSAGE = 'A moderator will look at this before it appears.'
# item kind -> (table, report column)
TARGETS = {'post': ('resq_community_posts', 'post_id'), 'comment': ('resq_community_comments', 'comment_id'), 'message': ('resq_community_messages', 'message_id')}


def community_user(user: dict = Depends(current_redesign_user)) -> dict:
    if user.get('role') not in PUBLIC_ROLES:
        raise HTTPException(status_code=403, detail='Community is not available for this account. Official notices are at /api/notices')
    return user


def _moderator(user: dict = Depends(community_user)) -> dict:
    if user.get('role') not in MODERATOR_ROLES:
        raise HTTPException(status_code=403, detail='Community moderation permission required')
    return user


def edit_window_minutes() -> int:
    """Author edit window (decision D-12: 15 minutes unless configured)."""
    try:
        return max(0, int(os.environ.get('COMMUNITY_EDIT_WINDOW_MINUTES', '15')))
    except ValueError:
        return 15


def _env_int(name: str) -> int | None:
    try:
        value = int(os.environ.get(name, ''))
    except ValueError:
        return None
    return value if value > 0 else None


def _shape(row: dict) -> dict:
    """Removed items keep their place in the thread but never expose their text; authors show as first name + initial, never an email."""
    item = {**row, 'author': _author(row), 'badge': badge_for(row.get('author_role')), 'state': 'held for review' if row.get('status') == 'held' else row.get('status')}
    if item.get('removed_at'):
        item['content'] = None
        item['removed'] = {'by': item.get('removal_kind'), 'reason': item.get('removal_reason') if item.get('removal_kind') == 'moderator' else None}
    for key in ('removed_by', 'removal_kind', 'removal_reason', 'removed_at', 'author_name', 'author_role', 'author_exists'):
        item.pop(key, None)
    return item


def _clean(value: str) -> str:
    value = value.strip()
    if not value:
        raise HTTPException(status_code=422, detail='Message content cannot be empty')
    return value


def _author(row: dict) -> dict:
    if 'author_exists' in row and row['author_exists'] is None:
        return {'id': row['author_id'], 'name': 'Deleted member'}
    return {'id': row['author_id'], 'name': public_name(row.get('author_name'))}


def _visible(alias: str) -> str:
    """Held items are visible only to their author (:viewer is -1 for nobody)."""
    return f"({alias}.status IN ('published','removed') OR ({alias}.status='held' AND {alias}.author_id=:viewer))"


def _viewer(user: dict | None) -> int:
    return int(user['id']) if user else -1


def _rate_limit(db, table: str, user_id: int, minutes: int = 10, limit: int = 10, role: str | None = None) -> None:
    new_hours = _env_int('COMMUNITY_NEW_ACCOUNT_HOURS')
    if new_hours and role not in MODERATOR_ROLES:
        is_new = db.execute(text("SELECT created_at > now() - make_interval(hours => :h) FROM resq_users WHERE id=:u"), {'h': new_hours, 'u': user_id}).scalar()
        if is_new:
            limit = min(limit, _env_int('COMMUNITY_NEW_ACCOUNT_LIMIT') or 3)
    # Table names are fixed internal values, never user input.
    count = db.execute(text(f"SELECT count(*) FROM {table} WHERE author_id=:user_id AND created_at > now() - make_interval(mins => :minutes)"), {'user_id': user_id, 'minutes': minutes}).scalar() or 0
    if count >= limit:
        raise HTTPException(status_code=429, detail='Please wait before posting again')


def _assert_not_muted(db, user_id: int) -> None:
    mute = db.execute(text('''SELECT reason,until FROM resq_community_sanctions WHERE user_id=:u AND kind='mute' AND lifted_at IS NULL
        AND (until IS NULL OR until > now()) ORDER BY (until IS NULL) DESC, until DESC LIMIT 1'''), {'u': user_id}).mappings().first()
    if mute:
        ends = f"until {mute['until'].isoformat()}" if mute['until'] else 'until a moderator lifts it'
        raise HTTPException(status_code=403, detail=f"You are muted {ends}. Reason: {mute['reason']}")


def _hold_with_reason(db, kind: str, item_id: int, reason: str) -> str:
    """Hold an item and queue it for a human moderator as an auto-held entry (a report with no reporter)."""
    table, column = TARGETS[kind]
    db.execute(text(f"UPDATE {table} SET status='held' WHERE id=:id AND status='published'"), {'id': item_id})
    db.execute(text(f'INSERT INTO resq_community_reports (reporter_id,{column},reason) VALUES (NULL,:id,:reason)'), {'id': item_id, 'reason': reason})
    return reason


def _hold_if_needed(db, kind: str, item_id: int, content: str) -> str | None:
    """Put a flagged item into the moderation queue as an auto-held entry. Returns the reason or None."""
    reason = held_reason(content)
    return _hold_with_reason(db, kind, item_id, reason) if reason else None


def _post_columns(extra: str = '') -> str:
    return f'''p.id,p.content,p.archived,p.created_at,p.updated_at,p.edited_at,p.post_type,p.post_type AS topic,p.language,p.region,p.status,p.removed_at,p.removed_by,p.removal_kind,p.removal_reason,p.author_id,
        u.id AS author_exists,u.name AS author_name,u.role AS author_role,
        (SELECT count(*) FROM resq_community_comments c WHERE c.post_id=p.id AND c.removed_at IS NULL AND c.status='published') AS comments_count,
        (SELECT count(*) FROM resq_community_reactions x WHERE x.post_id=p.id) AS helpful_count,
        EXISTS (SELECT 1 FROM resq_community_reactions x WHERE x.post_id=p.id AND x.user_id=:viewer) AS helpful_by_me{extra}'''


@router.get('/posts')
def list_posts(archived: bool = False, topic: str | None = Query(None, pattern='^(question|information|thanks)$'),
               language: str | None = Query(None, pattern='^(en|hi|or|other)$'), page: int = Query(1, ge=1),
               page_size: int = Query(20, ge=1, le=50), user: dict | None = Depends(optional_user)) -> dict:
    if not archived and not user:  # current discussion needs a signed-in account (D-03); the historical archive stays readable
        raise HTTPException(status_code=401, detail='Sign in to read the community')
    if user and not archived and user.get('role') not in PUBLIC_ROLES:
        raise HTTPException(status_code=403, detail='Community is not available for this account. Official notices are at /api/notices')
    offset = (page - 1) * page_size
    params = {'archived': archived, 'viewer': _viewer(user), 'topic': topic, 'language': language}
    where = f"p.archived=:archived AND {_visible('p')} AND (CAST(:topic AS text) IS NULL OR p.post_type=:topic) AND (CAST(:language AS text) IS NULL OR p.language=:language)"
    with engine.connect() as db:
        total = db.execute(text(f'SELECT count(*) FROM resq_community_posts p WHERE {where}'), params).scalar() or 0
        rows = db.execute(text(f'''SELECT {_post_columns()} FROM resq_community_posts p LEFT JOIN resq_users u ON u.id=p.author_id
            WHERE {where} ORDER BY p.created_at DESC LIMIT :limit OFFSET :offset'''), {**params, 'limit': page_size, 'offset': offset}).mappings().all()
    items = [{**_shape(dict(row)), 'verified': False} for row in rows]  # nothing posted by neighbours is verified; official facts are in notices
    if media.images_enabled():  # flag off: the key does not exist at all
        _attach_image_links(items, user)
    return {'items': items, 'page': page, 'page_size': page_size, 'total': total, 'has_more': offset + len(rows) < total}


def _attach_image_links(items: list[dict], user: dict | None) -> None:
    """Public view of post images: a link only. Never a status, signal or verdict; a held post shows its image to its author only."""
    ids = [item['id'] for item in items]
    have: dict = {}
    if ids:
        with engine.connect() as db:
            have = {r['post_id']: r['mime'] for r in db.execute(text('SELECT post_id,mime FROM resq_community_post_images WHERE post_id = ANY(:ids)'), {'ids': ids}).mappings().all()}
    viewer = _viewer(user)
    for item in items:
        mine = item['author']['id'] == viewer
        shown = item['id'] in have and not item.get('removed') and (item.get('state') != 'held for review' or mine)
        item['image'] = {'url': f"/api/community/posts/{item['id']}/image", 'mime': have[item['id']]} if shown else None


@router.post('/posts', status_code=201, dependencies=[Depends(require_csrf)])
def create_post(payload: CommunityPostRequest, user: dict = Depends(community_user)) -> dict:
    content = _clean(payload.content)
    topic = payload.topic or payload.post_type
    with engine.begin() as db:
        _assert_not_muted(db, int(user['id']))
        _rate_limit(db, 'resq_community_posts', int(user['id']), role=user.get('role'))
        row = db.execute(text('''INSERT INTO resq_community_posts (author_id,content,post_type,region,language) VALUES (:author_id,:content,:post_type,:region,:language)
            RETURNING id,content,archived,post_type,post_type AS topic,language,region,status,created_at,updated_at'''),
            {'author_id': user['id'], 'content': content, 'post_type': topic, 'region': (payload.region or '').strip() or None, 'language': payload.language}).mappings().one()
        held = _hold_if_needed(db, 'post', row['id'], content)
        name = db.execute(text('SELECT name FROM resq_users WHERE id=:id'), {'id': user['id']}).scalar()
    post_row = {**dict(row), 'status': 'held' if held else 'published'}
    post_row.update({'state': 'held for review' if held else 'published', 'verified': False, 'helpful_count': 0, 'helpful_by_me': False,
                     'author': {'id': user['id'], 'name': public_name(name)}, 'badge': badge_for(user.get('role')), 'comments_count': 0})
    message = HELD_MESSAGE if held else 'Community post published. It does not notify responders or create an incident.'
    return {'post': post_row, 'message': message, 'hint': emergency_hint(content)}


@router.post('/posts/{post_id}/helpful', dependencies=[Depends(require_csrf)])
def toggle_helpful(post_id: int, user: dict = Depends(community_user)) -> dict:
    uid = int(user['id'])
    with engine.begin() as db:
        _assert_not_muted(db, uid)
        if not db.execute(text("SELECT 1 FROM resq_community_posts WHERE id=:id AND status='published' AND archived=false"), {'id': post_id}).scalar():
            raise HTTPException(status_code=404, detail='Community post not found')
        added = db.execute(text('INSERT INTO resq_community_reactions (post_id,user_id) VALUES (:p,:u) ON CONFLICT DO NOTHING RETURNING 1'), {'p': post_id, 'u': uid}).scalar()
        if not added:
            db.execute(text('DELETE FROM resq_community_reactions WHERE post_id=:p AND user_id=:u'), {'p': post_id, 'u': uid})
        count = db.execute(text('SELECT count(*) FROM resq_community_reactions WHERE post_id=:p'), {'p': post_id}).scalar()
    return {'post_id': post_id, 'helpful_by_me': bool(added), 'helpful_count': count}


@router.get('/posts/{post_id}/comments')
def list_comments(post_id: int, user: dict = Depends(community_user)) -> dict:
    with engine.connect() as db:
        rows = db.execute(text(f'''SELECT c.id,c.post_id,c.content,c.status,c.created_at,c.edited_at,c.removed_at,c.removed_by,c.removal_kind,c.removal_reason,c.author_id,u.id AS author_exists,u.name AS author_name,u.role AS author_role
            FROM resq_community_comments c LEFT JOIN resq_users u ON u.id=c.author_id
            JOIN resq_community_posts p ON p.id=c.post_id WHERE c.post_id=:post_id AND p.archived=false AND p.status<>'held' AND {_visible('c')} ORDER BY c.created_at ASC LIMIT 100'''),
            {'post_id': post_id, 'viewer': _viewer(user)}).mappings().all()
    return {'items': [_shape(dict(row)) for row in rows]}


@router.post('/posts/{post_id}/comments', status_code=201, dependencies=[Depends(require_csrf)])
def create_comment(post_id: int, payload: CommunityCommentRequest, user: dict = Depends(community_user)) -> dict:
    content = _clean(payload.content)
    with engine.begin() as db:
        _assert_not_muted(db, int(user['id']))
        if not db.execute(text("SELECT 1 FROM resq_community_posts WHERE id=:id AND archived=false AND removed_at IS NULL AND status='published'"), {'id': post_id}).scalar():
            raise HTTPException(status_code=404, detail='Community post not found')
        _rate_limit(db, 'resq_community_comments', int(user['id']), role=user.get('role'))
        row = db.execute(text('''INSERT INTO resq_community_comments (post_id,author_id,content) VALUES (:post_id,:author_id,:content)
            RETURNING id,post_id,content,status,created_at'''), {'post_id': post_id, 'author_id': user['id'], 'content': content}).mappings().one()
        held = _hold_if_needed(db, 'comment', row['id'], content)
        name = db.execute(text('SELECT name FROM resq_users WHERE id=:id'), {'id': user['id']}).scalar()
    comment = {**dict(row), 'status': 'held' if held else 'published', 'state': 'held for review' if held else 'published',
               'author': {'id': user['id'], 'name': public_name(name)}, 'badge': badge_for(user.get('role'))}
    return {'comment': comment, 'hint': emergency_hint(content), **({'message': HELD_MESSAGE} if held else {})}


def _room_settings(row) -> dict:
    return {'region': row['region'], 'slow_mode_seconds': row['slow_mode_seconds'], 'frozen': row['frozen'], 'retention_days': row['retention_days']}


def _room_name(room: str | None) -> str:
    return (room or '').strip() or 'default'


@router.get('/rooms')
def list_rooms(user: dict = Depends(community_user)) -> dict:
    with engine.connect() as db:
        rows = db.execute(text('SELECT id,region,slow_mode_seconds,frozen,retention_days,created_at FROM resq_community_rooms ORDER BY region')).mappings().all()
    return {'items': [dict(row) for row in rows]}


@router.patch('/rooms/{region}', dependencies=[Depends(require_csrf)])
def update_room(region: str, payload: CommunityRoomUpdate, user: dict = Depends(_moderator)) -> dict:
    region = _room_name(region)
    changes = {key: getattr(payload, key) for key in payload.model_fields_set if key in ('slow_mode_seconds', 'frozen', 'retention_days')}
    if not changes or (changes.get('slow_mode_seconds', 0) is None) or (changes.get('frozen', False) is None):
        raise HTTPException(status_code=422, detail='Give slow_mode_seconds, frozen or retention_days')
    with engine.begin() as db:
        db.execute(text('INSERT INTO resq_community_rooms (region) VALUES (:r) ON CONFLICT (region) DO NOTHING'), {'r': region})
        previous = db.execute(text('SELECT slow_mode_seconds,frozen,retention_days FROM resq_community_rooms WHERE region=:r FOR UPDATE'), {'r': region}).mappings().one()
        assignments = ', '.join(f'{key}=:{key}' for key in changes)  # keys come from the fixed whitelist above
        row = db.execute(text(f'UPDATE resq_community_rooms SET {assignments} WHERE region=:r RETURNING id,region,slow_mode_seconds,frozen,retention_days,created_at'), {**changes, 'r': region}).mappings().one()
        audit_log.write_audit_log(action='community_room_updated', entity_type='community_room', entity_id=region, user_id=int(user['id']),
                                  metadata={'previous': dict(previous), 'changes': changes}, connection=db)
    return {'room': dict(row)}


@router.get('/chat')
def list_chat(room: str = Query('default', max_length=80), before_id: int | None = Query(None, gt=0), limit: int = Query(50, ge=1, le=50), user: dict = Depends(community_user)) -> dict:
    region = _room_name(room)
    params = {'limit': limit, 'region': region, 'viewer': _viewer(user)}
    clause = ''
    if before_id:
        clause = 'AND m.id < :before_id'
        params['before_id'] = before_id
    with engine.connect() as db:
        settings = db.execute(text('SELECT region,slow_mode_seconds,frozen,retention_days FROM resq_community_rooms WHERE region=:region'), params).mappings().first()
        rows = db.execute(text(f'''SELECT m.id,m.content,m.status,m.created_at,m.author_id,m.removed_at,m.removal_kind,m.removal_reason,u.id AS author_exists,u.name AS author_name,u.role AS author_role
            FROM resq_community_messages m JOIN resq_community_rooms r ON r.id=m.room_id AND r.region=:region LEFT JOIN resq_users u ON u.id=m.author_id
            WHERE {_visible('m')} {clause} ORDER BY m.id DESC LIMIT :limit'''), params).mappings().all()
    items = [_shape(dict(row)) for row in reversed(rows)]
    room_info = _room_settings(settings) if settings else {'region': region, 'slow_mode_seconds': 0, 'frozen': False, 'retention_days': None}
    return {'items': items, 'has_more': len(rows) == limit, 'delivery': 'polling', 'room': room_info}


@router.post('/chat', status_code=201, dependencies=[Depends(require_csrf)])
def create_chat_message(payload: CommunityMessageRequest, room: str = Query('default', max_length=80), user: dict = Depends(community_user)) -> dict:
    content = _clean(payload.content)
    region = _room_name(room)
    uid = int(user['id'])
    with engine.begin() as db:
        _assert_not_muted(db, uid)
        db.execute(text('INSERT INTO resq_community_rooms (region) VALUES (:r) ON CONFLICT (region) DO NOTHING'), {'r': region})
        settings = db.execute(text('SELECT id,slow_mode_seconds,frozen FROM resq_community_rooms WHERE region=:r'), {'r': region}).mappings().one()
        if settings['frozen']:
            raise HTTPException(status_code=403, detail='This room is paused by moderators')
        db.execute(text('SELECT pg_advisory_xact_lock(:k1, :k2)'), {'k1': uid, 'k2': int(settings['id'])})  # one writer per person per room at a time
        if settings['slow_mode_seconds']:
            elapsed = db.execute(text('SELECT extract(epoch FROM now() - max(created_at)) FROM resq_community_messages WHERE room_id=:room AND author_id=:u'), {'room': settings['id'], 'u': uid}).scalar()
            if elapsed is not None and elapsed < settings['slow_mode_seconds']:
                left = max(1, math.ceil(settings['slow_mode_seconds'] - float(elapsed)))
                raise HTTPException(status_code=429, detail=f'Slow mode is on in this room. Wait {left} seconds before posting again', headers={'Retry-After': str(left)})
        _rate_limit(db, 'resq_community_messages', uid, limit=20, role=user.get('role'))
        row = db.execute(text('''INSERT INTO resq_community_messages (author_id,content,room_id) VALUES (:author_id,:content,:room)
            RETURNING id,content,status,created_at'''), {'author_id': uid, 'content': content, 'room': settings['id']}).mappings().one()
        held = _hold_if_needed(db, 'message', row['id'], content)
        name = db.execute(text('SELECT name FROM resq_users WHERE id=:id'), {'id': uid}).scalar()
    message = {**dict(row), 'status': 'held' if held else 'published', 'state': 'held for review' if held else 'published', 'room': region,
               'author': {'id': uid, 'name': public_name(name)}, 'badge': badge_for(user.get('role'))}
    return {'message': message, 'hint': emergency_hint(content), **({'notice': HELD_MESSAGE} if held else {})}


@router.post('/posts/{post_id}/image', status_code=201, dependencies=[Depends(require_csrf)])
async def upload_post_image(post_id: int, image: UploadFile = File(...), user: dict = Depends(community_user)) -> dict:
    """Attach ONE image to your own post. Feature absent (404) unless COMMUNITY_IMAGES_ENABLED. The stored copy is re-encoded (no EXIF/GPS).

    With FIRE_EVIDENCE_COMMUNITY_ENABLED the original upload is also checked for authenticity signals; anything other than 'no concern found',
    including an unavailable model, holds the post for a human moderator. It never creates an incident, alert or assignment and never removes
    or publishes anything by itself. The author is told only that a moderator will look, never why."""
    if not media.images_enabled():
        raise HTTPException(status_code=404, detail='Not found')
    uid = int(user['id'])
    with engine.connect() as db:
        _assert_not_muted(db, uid)
        post = db.execute(text('SELECT id,author_id,status,archived FROM resq_community_posts WHERE id=:id'), {'id': post_id}).mappings().first()
    if not post or post['author_id'] != uid or post['archived'] or post['status'] == 'removed':
        raise HTTPException(status_code=404, detail='Community post not found')
    data = await image.read(media.max_image_bytes() + 1)
    try:
        clean, mime = media.validate_and_reencode(data, image.content_type)
    except media.ImageRejected as exc:
        raise HTTPException(status_code=exc.status, detail=exc.detail) from exc
    digest = hashlib.sha256(clean).hexdigest()
    key = media.storage_key(post_id, digest, mime)
    result = await media.assess_upload(data, key) if media.assessment_enabled() else None  # original bytes: provenance markers live in the metadata
    created_file = False
    try:
        created_file = await media.write_clean_copy_async(key, clean, mime)
        with engine.begin() as db:
            _rate_limit(db, 'resq_community_post_images', uid, limit=5, role=user.get('role'))
            locked = db.execute(text('SELECT status FROM resq_community_posts WHERE id=:id AND removed_at IS NULL FOR UPDATE'), {'id': post_id}).scalar()
            if locked is None:
                raise HTTPException(status_code=404, detail='Community post not found')
            if db.execute(text('SELECT 1 FROM resq_community_post_images WHERE post_id=:id'), {'id': post_id}).scalar():
                raise HTTPException(status_code=409, detail='This post already has an image')
            row = media.insert_image(db, post_id=post_id, author_id=uid, key=key, sha256=digest, mime=mime, size_bytes=len(clean))
            if result is not None:
                media.insert_assessment(db, image_id=row['id'], result=result)
                reason = media.hold_reason(result)
                if reason:
                    _hold_with_reason(db, 'post', post_id, reason)
            status = db.execute(text('SELECT status FROM resq_community_posts WHERE id=:id'), {'id': post_id}).scalar()
    except HTTPException:
        if created_file:
            await media.discard_async(key)
        raise
    except Exception as exc:
        if created_file:
            await media.discard_async(key)
        raise HTTPException(status_code=503, detail='Image could not be stored') from exc
    return {'image': {'id': row['id'], 'mime': row['mime'], 'size_bytes': row['size_bytes']}, 'post_status': status,
            'message': HELD_MESSAGE if status == 'held' else 'Image added. It does not notify responders or create an incident.'}


@router.get('/posts/{post_id}/image')
async def get_post_image(post_id: int, user: dict = Depends(community_user)) -> Response:
    """The clean copy. Moderators and the author always (unless removed); everyone else only while the post is published."""
    if not media.images_enabled():
        raise HTTPException(status_code=404, detail='Not found')
    with engine.connect() as db:
        row = db.execute(text('''SELECT i.storage_key,i.sha256,i.mime,p.status,p.author_id,p.removed_at FROM resq_community_post_images i
            JOIN resq_community_posts p ON p.id=i.post_id WHERE i.post_id=:id'''), {'id': post_id}).mappings().first()
    allowed = row and not row['removed_at'] and row['status'] != 'removed' and (
        row['status'] == 'published' or row['author_id'] == int(user['id']) or user.get('role') in MODERATOR_ROLES)
    data = await media.read_verified_async(row['storage_key'], row['sha256']) if allowed else None
    if data is None:
        raise HTTPException(status_code=404, detail='Image not found')
    return Response(content=data, media_type=row['mime'], headers={'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff'})


@router.post('/posts/{post_id}/report', status_code=201, dependencies=[Depends(require_csrf)])
def report_post(post_id: int, payload: CommunityReportRequest, user: dict = Depends(community_user)) -> dict:
    reason = _clean(payload.reason)
    with engine.begin() as db:
        if not db.execute(text("SELECT 1 FROM resq_community_posts WHERE id=:id AND (status<>'held' OR author_id=:u)"), {'id': post_id, 'u': user['id']}).scalar():
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


def _own_or_moderate(db, table: str, item_id: int, user: dict, *, label: str) -> dict:
    row = db.execute(text(f'SELECT id,author_id,created_at,removed_at,status,(now() - created_at) AS age FROM {table} WHERE id=:id FOR UPDATE'), {'id': item_id}).mappings().first()
    if not row:
        raise HTTPException(status_code=404, detail=f'{label} not found')
    return dict(row)


def _edit(table: str, kind: str, item_id: int, content: str, user: dict, label: str) -> dict:
    content = _clean(content)
    window = edit_window_minutes()
    with engine.begin() as db:
        row = _own_or_moderate(db, table, item_id, user, label=label)
        if row['author_id'] != int(user['id']):
            raise HTTPException(status_code=403, detail=f'Only the author can edit this {label.lower()}')
        _assert_not_muted(db, int(user['id']))
        if row['removed_at']:
            raise HTTPException(status_code=409, detail=f'This {label.lower()} was removed')
        if row['age'].total_seconds() > window * 60:
            raise HTTPException(status_code=409, detail=f'Posts can be edited for {window} minutes after they are published')
        updated = db.execute(text(f'UPDATE {table} SET content=:content, edited_at=now() WHERE id=:id RETURNING id,content,edited_at,status'), {'content': content, 'id': item_id}).mappings().one()
        held = _hold_if_needed(db, kind, item_id, content) if row['status'] == 'published' else None  # an edit cannot smuggle in a number or link
        result = dict(updated)
        if held:
            result.update({'status': 'held', 'state': 'held for review', 'message': HELD_MESSAGE})
    return result


def _remove(table: str, item_id: int, reason: str | None, user: dict, label: str) -> dict:
    with engine.begin() as db:
        row = _own_or_moderate(db, table, item_id, user, label=label)
        by_author = row['author_id'] == int(user['id'])
        if not by_author and user.get('role') not in MODERATOR_ROLES:
            raise HTTPException(status_code=403, detail=f'You can only remove your own {label.lower()}')
        reason = (reason or '').strip() or None
        if not by_author and not reason:
            raise HTTPException(status_code=422, detail='Moderators must give a reason when removing content')
        if row['removed_at']:
            return {'id': item_id, 'removed': True}
        kind = 'author' if by_author else 'moderator'
        db.execute(text(f"UPDATE {table} SET removed_at=now(), status='removed', removed_by=:u, removal_kind=:k, removal_reason=:r WHERE id=:id"), {'u': user['id'], 'k': kind, 'r': reason, 'id': item_id})
        audit_log.write_audit_log(action=f'community_{label.lower()}_removed_by_{kind}', entity_type=f'community_{label.lower()}', entity_id=str(item_id), user_id=int(user['id']), metadata={'reason': reason, 'author_id': row['author_id']}, connection=db)
    return {'id': item_id, 'removed': True}


@router.patch('/posts/{post_id}', dependencies=[Depends(require_csrf)])
def edit_post(post_id: int, payload: CommunityEditRequest, user: dict = Depends(community_user)) -> dict:
    return {'post': _edit('resq_community_posts', 'post', post_id, payload.content, user, 'Post')}


@router.delete('/posts/{post_id}', dependencies=[Depends(require_csrf)])
def remove_post(post_id: int, payload: CommunityRemovalRequest | None = None, user: dict = Depends(community_user)) -> dict:
    return _remove('resq_community_posts', post_id, payload.reason if payload else None, user, 'Post')


@router.patch('/comments/{comment_id}', dependencies=[Depends(require_csrf)])
def edit_comment(comment_id: int, payload: CommunityEditRequest, user: dict = Depends(community_user)) -> dict:
    return {'comment': _edit('resq_community_comments', 'comment', comment_id, payload.content, user, 'Comment')}


@router.delete('/comments/{comment_id}', dependencies=[Depends(require_csrf)])
def remove_comment(comment_id: int, payload: CommunityRemovalRequest | None = None, user: dict = Depends(community_user)) -> dict:
    return _remove('resq_community_comments', comment_id, payload.reason if payload else None, user, 'Comment')


@router.delete('/chat/{message_id}', dependencies=[Depends(require_csrf)])
def remove_message(message_id: int, payload: CommunityRemovalRequest | None = None, user: dict = Depends(community_user)) -> dict:
    return _remove('resq_community_messages', message_id, payload.reason if payload else None, user, 'Message')


@router.post('/comments/{comment_id}/report', status_code=201, dependencies=[Depends(require_csrf)])
def report_comment(comment_id: int, payload: CommunityReportRequest, user: dict = Depends(community_user)) -> dict:
    reason = _clean(payload.reason)
    with engine.begin() as db:
        if not db.execute(text("SELECT 1 FROM resq_community_comments WHERE id=:id AND (status<>'held' OR author_id=:u)"), {'id': comment_id, 'u': user['id']}).scalar():
            raise HTTPException(status_code=404, detail='Comment not found')
        db.execute(text('INSERT INTO resq_community_reports (reporter_id,comment_id,reason) VALUES (:u,:c,:r) ON CONFLICT DO NOTHING'), {'u': user['id'], 'c': comment_id, 'r': reason})
    return {'status': 'received', 'message': 'The community report was recorded for moderation. It does not create an incident.'}


@router.post('/chat/{message_id}/report', status_code=201, dependencies=[Depends(require_csrf)])
def report_message(message_id: int, payload: CommunityReportRequest, user: dict = Depends(community_user)) -> dict:
    reason = _clean(payload.reason)
    with engine.begin() as db:
        if not db.execute(text("SELECT 1 FROM resq_community_messages WHERE id=:id AND (status<>'held' OR author_id=:u)"), {'id': message_id, 'u': user['id']}).scalar():
            raise HTTPException(status_code=404, detail='Message not found')
        db.execute(text('INSERT INTO resq_community_reports (reporter_id,message_id,reason) VALUES (:u,:m,:r) ON CONFLICT DO NOTHING'), {'u': user['id'], 'm': message_id, 'r': reason})
    return {'status': 'received', 'message': 'The community report was recorded for moderation. It does not create an incident.'}


@router.get('/moderation/queue')
def moderation_queue(user: dict = Depends(_moderator)) -> dict:
    """Unsafe advice and harassment first, then auto-held items, then other reports; oldest first inside each group."""
    with engine.connect() as db:
        rows = db.execute(text('''WITH q AS (SELECT r.id,r.reason,r.created_at,r.post_id,r.comment_id,r.message_id,(r.reporter_id IS NULL) AS held,
              COALESCE(p.content,c.content,m.content) AS content, COALESCE(p.status,c.status,m.status) AS status,
              COALESCE(p.removed_at,c.removed_at,m.removed_at) AS removed_at, COALESCE(p.author_id,c.author_id,m.author_id) AS author_id,
              (SELECT count(*) FROM resq_community_reports o WHERE o.status='open' AND o.post_id IS NOT DISTINCT FROM r.post_id AND o.comment_id IS NOT DISTINCT FROM r.comment_id AND o.message_id IS NOT DISTINCT FROM r.message_id) AS open_reports,
              CASE WHEN r.reason ILIKE '%unsafe advice%' OR r.reason ILIKE '%harassment%' THEN 0 WHEN r.reporter_id IS NULL THEN 1 ELSE 2 END AS rank
            FROM resq_community_reports r LEFT JOIN resq_community_posts p ON p.id=r.post_id LEFT JOIN resq_community_comments c ON c.id=r.comment_id
            LEFT JOIN resq_community_messages m ON m.id=r.message_id WHERE r.status='open')
            SELECT q.*, u.id AS author_exists, u.name AS author_name,
              (SELECT count(*) FROM resq_community_posts x WHERE x.author_id=q.author_id AND x.removal_kind='moderator')
              + (SELECT count(*) FROM resq_community_comments x WHERE x.author_id=q.author_id AND x.removal_kind='moderator')
              + (SELECT count(*) FROM resq_community_messages x WHERE x.author_id=q.author_id AND x.removal_kind='moderator') AS author_prior_removals
            FROM q LEFT JOIN resq_users u ON u.id=q.author_id ORDER BY q.rank, q.created_at ASC LIMIT 100''')).mappings().all()
    items = []
    for row in rows:
        item = dict(row)
        rank = item.pop('rank')
        item['severity'] = ('high', 'held', 'normal')[rank]
        item['kind'] = 'post' if item['post_id'] else 'comment' if item['comment_id'] else 'message'
        item['author_name'] = 'Deleted member' if item.pop('author_exists') is None else public_name(item['author_name'])
        items.append(item)
    if media.images_enabled():  # moderators only (this route is _moderator); with the flag off none of these keys exist
        with engine.connect() as db:
            found = media.moderator_media_for_posts(db, [i['post_id'] for i in items if i['post_id']])
        for item in items:
            extra = found.get(item['post_id']) if item['post_id'] else None
            if extra:
                item['image'] = extra['image']
                if 'assessment' in extra:
                    item['media_assessment'] = extra['assessment']
                    item['media_assessed_at'] = extra['assessed_at']
                    item['media_moderator_decision'] = extra['moderator_decision']
    return {'items': items}


@router.post('/moderation/reports/{report_id}/resolve', dependencies=[Depends(require_csrf)])
def resolve_report(report_id: int, payload: CommunityModerationDecision, user: dict = Depends(_moderator)) -> dict:
    reason = (payload.reason or '').strip() or None
    if payload.action == 'remove' and (not reason or len(reason) < 3):
        raise HTTPException(status_code=422, detail='Give a reason of at least 3 characters when removing content')
    with engine.begin() as db:
        report = db.execute(text("SELECT id,post_id,comment_id,message_id FROM resq_community_reports WHERE id=:id AND status='open' FOR UPDATE"), {'id': report_id}).mappings().first()
        if not report:
            raise HTTPException(status_code=404, detail='Open report not found')
        kind = 'post' if report['post_id'] else 'comment' if report['comment_id'] else 'message'
        table, column = TARGETS[kind]
        item_id = report[column]
        status = db.execute(text(f'SELECT status FROM {table} WHERE id=:id FOR UPDATE'), {'id': item_id}).scalar()
        if payload.action == 'approve':
            if status != 'held':
                raise HTTPException(status_code=409, detail='Only items held for review can be approved')
            db.execute(text(f"UPDATE {table} SET status='published' WHERE id=:id"), {'id': item_id})
        elif payload.action == 'dismiss' and status == 'held':
            raise HTTPException(status_code=409, detail='This item is held for review: approve or remove it')
        elif payload.action == 'remove':
            db.execute(text(f"UPDATE {table} SET removed_at=COALESCE(removed_at,now()), status='removed', removed_by=:u, removal_kind='moderator', removal_reason=:r WHERE id=:id AND removed_at IS NULL"), {'u': user['id'], 'r': reason, 'id': item_id})
        resolution = {'approve': 'approved', 'remove': 'removed', 'dismiss': 'dismissed'}[payload.action]
        db.execute(text(f"UPDATE resq_community_reports SET status='resolved', resolution=:res, resolution_reason=:r, resolved_by=:u, resolved_at=now() WHERE status='open' AND {column}=:id"), {'res': resolution, 'r': reason, 'u': user['id'], 'id': item_id})
        if kind == 'post':  # remember the human decision next to the advisory media assessment (no-op for posts without one)
            media.record_moderator_decision(db, post_id=item_id, resolution=resolution, moderator_id=int(user['id']), note=reason)
        audit_log.write_audit_log(action=f'community_report_{resolution}', entity_type='community_report', entity_id=str(report_id), user_id=int(user['id']),
                                  metadata={'reason': reason, 'post_id': report['post_id'], 'comment_id': report['comment_id'], 'message_id': report['message_id']}, connection=db)
    return {'status': resolution}


@router.post('/sanctions', status_code=201, dependencies=[Depends(require_csrf)])
def create_sanction(payload: CommunitySanctionRequest, user: dict = Depends(_moderator)) -> dict:
    with engine.begin() as db:
        target = db.execute(text('SELECT id,role FROM resq_users WHERE id=:id'), {'id': payload.user_id}).mappings().first()
        if not target:
            raise HTTPException(status_code=404, detail='User not found')
        if target['id'] == int(user['id']):
            raise HTTPException(status_code=422, detail='You cannot sanction yourself')
        if target['role'] in STAFF_ROLES and user.get('role') != 'admin':
            raise HTTPException(status_code=403, detail='Only an administrator can sanction staff')
        until_hours = payload.hours if payload.kind == 'mute' else None
        row = db.execute(text('''INSERT INTO resq_community_sanctions (user_id,kind,reason,until,created_by)
            VALUES (:u,:k,:r,CASE WHEN CAST(:h AS integer) IS NULL THEN NULL ELSE now() + make_interval(hours => CAST(:h AS integer)) END,:by)
            RETURNING id,user_id,kind,reason,until,created_by,created_at,lifted_at'''), {'u': payload.user_id, 'k': payload.kind, 'r': payload.reason.strip(), 'h': until_hours, 'by': user['id']}).mappings().one()
        audit_log.write_audit_log(action=f'community_{payload.kind}', entity_type='community_sanction', entity_id=str(row['id']), user_id=int(user['id']),
                                  metadata={'target_user_id': payload.user_id, 'reason': payload.reason, 'hours': until_hours}, connection=db)
    if payload.kind == 'warn':
        alert_service.generate_alert(kind='community_warning', message=f'A moderator warned you about community conduct: {payload.reason.strip()}', severity='warning',
                                     entity_type='community_sanction', entity_id=str(row['id']), user_id=payload.user_id)
    return {'sanction': dict(row)}


@router.post('/sanctions/{sanction_id}/lift', dependencies=[Depends(require_csrf)])
def lift_sanction(sanction_id: int, user: dict = Depends(_moderator)) -> dict:
    with engine.begin() as db:
        found = db.execute(text('SELECT id FROM resq_community_sanctions WHERE id=:id FOR UPDATE'), {'id': sanction_id}).scalar()
        if not found:
            raise HTTPException(status_code=404, detail='Sanction not found')
        row = db.execute(text('UPDATE resq_community_sanctions SET lifted_at=COALESCE(lifted_at,now()) WHERE id=:id RETURNING id,user_id,kind,reason,until,created_by,created_at,lifted_at'), {'id': sanction_id}).mappings().one()
        audit_log.write_audit_log(action='community_sanction_lifted', entity_type='community_sanction', entity_id=str(sanction_id), user_id=int(user['id']), metadata={'target_user_id': row['user_id']}, connection=db)
    return {'sanction': dict(row)}


@router.get('/sanctions')
def list_sanctions(user_id: int | None = Query(None, gt=0), user: dict = Depends(_moderator)) -> dict:
    with engine.connect() as db:
        rows = db.execute(text('''SELECT id,user_id,kind,reason,until,created_by,created_at,lifted_at,
              (kind='mute' AND lifted_at IS NULL AND (until IS NULL OR until > now())) AS active
            FROM resq_community_sanctions WHERE CAST(:u AS integer) IS NULL OR user_id=:u ORDER BY created_at DESC, id DESC LIMIT 100'''), {'u': user_id}).mappings().all()
    return {'items': [dict(row) for row in rows]}
