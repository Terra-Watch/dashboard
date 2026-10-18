"""Community D5 rules: held content, hints, topics, helpful, rooms, sanctions, retention, queue, privacy, roles (real PostgreSQL)."""
import uuid

import pytest
from sqlalchemy import text

from app.database.session import engine
from app.services.community_rules import emergency_hint, has_coordinates, has_link, has_phone, held_reason, public_name, purge_expired_messages
from tests.test_fire_evidence_routes import actor, database, db_one, db_scalar, isolated  # noqa: F401


# ---- pure detectors -------------------------------------------------------------------------------------------------
@pytest.mark.parametrize('value', ['Call +91 98765 43210 now', 'office 0674-2345678', '9876543210', 'ring (0674) 234 5678', '98765-43210', 'call me on +91-98765-43210 please'])
def test_phone_numbers_are_detected(value):
    assert has_phone(value) and held_reason(value) == 'auto: phone'


@pytest.mark.parametrize('value', ['3 km north of the road', 'Reached 12 villages in 2 days', 'about 25 people, 40 cattle', 'Fire danger level 4 on 15 March', 'wait 1.5 hours', 'Pin 751001 area, ward 12'])
def test_ordinary_numbers_are_not_held(value):
    assert held_reason(value) is None


@pytest.mark.parametrize('value', ['see https://example.org/x', 'visit www.example.com', 'bit.ly/abc123', 'mail me a@b.com', 'forest.gov.in has it', 'http://1.2.3.4/x'])
def test_links_are_detected(value):
    assert has_link(value) and held_reason(value) == 'auto: link'


@pytest.mark.parametrize('value', ['The water point is near the school. Then turn left.', 'Use e.g. a wet cloth', 'version 2.5 is fine'])
def test_sentences_are_not_links(value):
    assert not has_link(value)


@pytest.mark.parametrize('value', ['20.2961, 85.8245', 'at 20.2961 85.8245', '-20.55,85.81', '20.2961N, 85.8245E', '20.296°N 85.824°E', 'lat 20.30; lon 85.82 here'])
def test_coordinates_are_detected_and_not_called_phone(value):
    assert has_coordinates(value) and held_reason(value) == 'auto: coordinates'


@pytest.mark.parametrize('value', ['temperature 32.5, humidity 40.2', 'it rose 2.5 4.5 degrees', 'distance 95.5, 190.5'])
def test_decimals_that_are_not_places_are_not_held(value):
    assert held_reason(value) is None


def test_emergency_phrases():
    for value in ['There is a fire at the north ridge', 'The hill is burning', 'please help', 'two people trapped', 'आग लग गई है', 'ନିଆଁ ଲାଗିଛି']:
        assert emergency_hint(value) == 'emergency', value
    for value in ['How do I prepare a go bag?', 'This was very helpful, thanks', 'Where is the water point?']:
        assert emergency_hint(value) is None, value


def test_public_names():
    assert public_name('Asha Rao') == 'Asha R.' and public_name('Asha') == 'Asha' and public_name('asha rao kumar') == 'asha R.'
    assert public_name(None) == 'TerraWatch member' and public_name('a@b.com') == 'TerraWatch member'


# ---- helpers ----------------------------------------------------------------------------------------------------------
def make_post(c, h, content="How do I prepare a go bag?", **extra):
    r = c.post('/api/community/posts', headers=h, json={'content': content, 'post_type': 'question', 'region': 'Similipal', **extra})
    assert r.status_code == 201, r.text
    return r.json()


def room_name():
    return f'room-{uuid.uuid4().hex[:8]}'


def clear_queue():
    """The shared test database keeps open reports from earlier runs; the queue shows the 100 most severe, so start these tests from an empty queue."""
    with engine.begin() as db:
        db.execute(text("UPDATE resq_community_reports SET status='resolved', resolution='dismissed' WHERE status='open'"))


def staff(role='control_room_operator'):
    return actor(role, scopes=['OD'])


# ---- held content -----------------------------------------------------------------------------------------------------
def test_post_with_phone_is_held_hidden_from_others_visible_to_author_and_queued():
    clear_queue()
    c, h, uid = actor('citizen'); other, oh, _ = actor('citizen')
    body = make_post(c, h, 'Call me on +91 98765 43210 for water')
    pid = body['post']['id']
    assert body['post']['status'] == 'held' and body['post']['state'] == 'held for review' and 'moderator' in body['message']
    mine = next(i for i in c.get('/api/community/posts', headers=h).json()['items'] if i['id'] == pid)
    assert mine['state'] == 'held for review' and mine['content']
    assert not [i for i in other.get('/api/community/posts', headers=oh).json()['items'] if i['id'] == pid]
    assert other.post(f'/api/community/posts/{pid}/comments', headers=oh, json={'content': 'hi'}).status_code == 404
    mod, mh, _ = staff()
    entry = next(q for q in mod.get('/api/community/moderation/queue', headers=mh).json()['items'] if q['post_id'] == pid)
    assert entry['reason'] == 'auto: phone' and entry['held'] is True and entry['author_id'] == uid and entry['content'].startswith('Call me')
    assert mod.post(f"/api/community/moderation/reports/{entry['id']}/resolve", headers=mh, json={'action': 'approve'}).json()['status'] == 'approved'
    assert db_scalar('SELECT status FROM resq_community_posts WHERE id=:i', i=pid) == 'published'
    assert [i for i in other.get('/api/community/posts', headers=oh).json()['items'] if i['id'] == pid]


@pytest.mark.parametrize('content,reason', [('Read https://example.org/x', 'auto: link'), ('Spot is 20.2961, 85.8245', 'auto: coordinates')])
def test_links_and_coordinates_are_held_and_staff_can_remove(content, reason):
    clear_queue()
    c, h, _ = actor('citizen'); pid = make_post(c, h, content)['post']['id']
    mod, mh, _ = staff('incident_commander')
    entry = next(q for q in mod.get('/api/community/moderation/queue', headers=mh).json()['items'] if q['post_id'] == pid)
    assert entry['reason'] == reason
    url = f"/api/community/moderation/reports/{entry['id']}/resolve"
    assert mod.post(url, headers=mh, json={'action': 'remove'}).status_code == 422                 # reason required
    assert mod.post(url, headers=mh, json={'action': 'dismiss', 'reason': 'ok'}).status_code == 409  # held items are approved or removed
    assert mod.post(url, headers=mh, json={'action': 'remove', 'reason': 'Shares a location'}).json()['status'] == 'removed'
    assert db_scalar('SELECT status FROM resq_community_posts WHERE id=:i', i=pid) == 'removed'


def test_approve_is_only_valid_for_held_items():
    clear_queue()
    c, h, _ = actor('citizen'); pid = make_post(c, h)['post']['id']
    r = c.post(f'/api/community/posts/{pid}/report', headers=h, json={'reason': 'Rude'}); assert r.status_code == 201
    mod, mh, _ = staff()
    rid = next(q['id'] for q in mod.get('/api/community/moderation/queue', headers=mh).json()['items'] if q['post_id'] == pid)
    assert mod.post(f'/api/community/moderation/reports/{rid}/resolve', headers=mh, json={'action': 'approve'}).status_code == 409


def test_edit_cannot_smuggle_in_a_number_and_comments_and_messages_are_held_too():
    clear_queue()
    c, h, _ = actor('citizen'); pid = make_post(c, h)['post']['id']
    edited = c.patch(f'/api/community/posts/{pid}', headers=h, json={'content': 'ring 9876543210'})
    assert edited.status_code == 200 and edited.json()['post']['status'] == 'held'
    cm = c.post(f'/api/community/posts/{make_post(c, h)["post"]["id"]}/comments', headers=h, json={'content': 'see www.example.com'})
    assert cm.status_code == 201 and cm.json()['comment']['status'] == 'held'
    msg = c.post(f'/api/community/chat?room={room_name()}', headers=h, json={'content': 'call 0674-2345678'})
    assert msg.status_code == 201 and msg.json()['message']['status'] == 'held'
    mod, mh, _ = staff()
    reasons = {q['reason'] for q in mod.get('/api/community/moderation/queue', headers=mh).json()['items'] if q['message_id'] == msg.json()['message']['id']}
    assert reasons == {'auto: phone'}


def test_held_chat_message_is_visible_only_to_its_author():
    c, h, _ = actor('citizen'); other, oh, _ = actor('citizen'); room = room_name()
    mid = c.post(f'/api/community/chat?room={room}', headers=h, json={'content': 'visit forest.gov.in'}).json()['message']['id']
    assert [m['id'] for m in c.get(f'/api/community/chat?room={room}', headers=h).json()['items']] == [mid]
    assert other.get(f'/api/community/chat?room={room}', headers=oh).json()['items'] == []


# ---- hint, topic, language, helpful ----------------------------------------------------------------------------------
def test_emergency_hint_on_post_and_message_and_still_published_and_no_alert():
    c, h, uid = actor('citizen')
    body = make_post(c, h, 'There is a fire at the north ridge')
    assert body['hint'] == 'emergency' and body['post']['status'] == 'published'
    msg = c.post(f'/api/community/chat?room={room_name()}', headers=h, json={'content': 'please help, trapped near the road'})
    assert msg.json()['hint'] == 'emergency' and msg.json()['message']['status'] == 'published'
    assert make_post(c, h)['hint'] is None
    assert db_scalar('SELECT count(*) FROM resq_alerts WHERE user_id=:u', u=uid) == 0 and db_scalar('SELECT count(*) FROM resq_incidents WHERE reporter_id=:u', u=uid) == 0


def test_topic_language_filters_and_information_is_never_verified():
    c, h, _ = actor('citizen'); tag = uuid.uuid4().hex[:6]
    a = make_post(c, h, f'Water point open {tag}', post_type='information', language='hi')['post']['id']
    b = make_post(c, h, f'Thank you all {tag}', post_type='thanks')['post']['id']
    assert c.post('/api/community/posts', headers=h, json={'content': 'x y', 'language': 'fr'}).status_code == 422
    info = c.get('/api/community/posts?topic=information', headers=h).json()['items']
    assert a in [i['id'] for i in info] and b not in [i['id'] for i in info]
    assert all(i['verified'] is False and i['topic'] == 'information' for i in info)
    hindi = c.get('/api/community/posts?language=hi', headers=h).json()['items']
    assert a in [i['id'] for i in hindi] and all(i['language'] == 'hi' for i in hindi)
    assert next(i for i in c.get('/api/community/posts', headers=h).json()['items'] if i['id'] == b)['language'] == 'en'
    assert c.get('/api/community/posts?topic=bogus', headers=h).status_code == 422


def test_helpful_toggle_counts_once_per_person():
    c, h, _ = actor('citizen'); other, oh, _ = actor('citizen'); pid = make_post(c, h)['post']['id']
    assert other.post(f'/api/community/posts/{pid}/helpful', headers=oh).json() == {'post_id': pid, 'helpful_by_me': True, 'helpful_count': 1}
    assert c.post(f'/api/community/posts/{pid}/helpful', headers=h).json()['helpful_count'] == 2
    mine = next(i for i in other.get('/api/community/posts', headers=oh).json()['items'] if i['id'] == pid)
    assert mine['helpful_count'] == 2 and mine['helpful_by_me'] is True
    assert other.post(f'/api/community/posts/{pid}/helpful', headers=oh).json() == {'post_id': pid, 'helpful_by_me': False, 'helpful_count': 1}
    assert db_scalar('SELECT count(*) FROM resq_community_reactions WHERE post_id=:p', p=pid) == 1
    assert other.post('/api/community/posts/999999999/helpful', headers=oh).status_code == 404


# ---- rooms -----------------------------------------------------------------------------------------------------------
def test_chat_defaults_room_auto_creation_and_length_limit():
    c, h, _ = actor('citizen'); room = room_name()
    assert c.post(f'/api/community/chat?room={room}', headers=h, json={'content': 'x' * 501}).status_code == 422
    assert c.post(f'/api/community/chat?room={room}', headers=h, json={'content': 'x' * 500}).status_code == 201
    assert db_one('SELECT slow_mode_seconds,frozen,retention_days FROM resq_community_rooms WHERE region=:r', r=room) == {'slow_mode_seconds': 0, 'frozen': False, 'retention_days': None}
    posted = c.post('/api/community/chat', headers=h, json={'content': 'Is the road open?'}).json()['message']
    default = c.get('/api/community/chat', headers=h).json()
    assert posted['id'] in [m['id'] for m in default['items']] and default['room']['region'] == 'default'
    assert posted['id'] not in [m['id'] for m in c.get(f'/api/community/chat?room={room}', headers=h).json()['items']]
    assert db_scalar("SELECT count(*) FROM resq_community_messages WHERE room_id IS NULL") == 0


def test_slow_mode_frozen_room_and_staff_settings_are_audited():
    c, h, _ = actor('citizen'); mod, mh, mod_id = staff('admin'); room = room_name()
    assert c.patch(f'/api/community/rooms/{room}', headers=h, json={'frozen': True}).status_code == 403
    r = mod.patch(f'/api/community/rooms/{room}', headers=mh, json={'slow_mode_seconds': 30, 'retention_days': 7})
    assert r.status_code == 200 and r.json()['room']['slow_mode_seconds'] == 30 and r.json()['room']['retention_days'] == 7
    assert c.post(f'/api/community/chat?room={room}', headers=h, json={'content': 'first'}).status_code == 201
    slow = c.post(f'/api/community/chat?room={room}', headers=h, json={'content': 'second'})
    assert slow.status_code == 429 and 'Wait' in slow.json()['detail'] and 25 <= int(slow.headers['retry-after']) <= 30
    assert c.post(f'/api/community/chat?room={room_name()}', headers=h, json={'content': 'another room is not slowed'}).status_code == 201
    with engine.begin() as db:
        db.execute(text("UPDATE resq_community_messages SET created_at = now() - interval '31 seconds' WHERE room_id=(SELECT id FROM resq_community_rooms WHERE region=:r)"), {'r': room})
    assert c.post(f'/api/community/chat?room={room}', headers=h, json={'content': 'third'}).status_code == 201
    assert mod.patch(f'/api/community/rooms/{room}', headers=mh, json={'frozen': True}).json()['room']['frozen'] is True
    frozen = c.post(f'/api/community/chat?room={room}', headers=h, json={'content': 'fourth'})
    assert frozen.status_code == 403 and frozen.json()['detail'] == 'This room is paused by moderators'
    assert c.get(f'/api/community/chat?room={room}', headers=h).json()['room']['frozen'] is True       # reading still works
    assert mod.patch(f'/api/community/rooms/{room}', headers=mh, json={'retention_days': None}).json()['room']['retention_days'] is None
    assert mod.patch(f'/api/community/rooms/{room}', headers=mh, json={}).status_code == 422
    assert mod.patch(f'/api/community/rooms/{room}', headers=mh, json={'slow_mode_seconds': -1}).status_code == 422
    listing = c.get('/api/community/rooms', headers=h).json()['items']
    assert next(x for x in listing if x['region'] == room)['frozen'] is True and all(set(x) == {'id', 'region', 'slow_mode_seconds', 'frozen', 'retention_days', 'created_at'} for x in listing)
    assert db_one("SELECT metadata FROM resq_audit_log WHERE action='community_room_updated' AND entity_id=:e ORDER BY id DESC LIMIT 1", e=room)['metadata']['changes'] == {'retention_days': None}


def test_room_update_needs_csrf_and_a_moderator_role():
    mod, mh, _ = staff('incident_commander'); room = room_name()
    assert mod.patch(f'/api/community/rooms/{room}', headers={'Authorization': mh['Authorization']}, json={'frozen': True}).status_code in {401, 403}
    officer, oh, _ = actor('range_officer')
    assert officer.patch(f'/api/community/rooms/{room}', headers=oh, json={'frozen': True}).status_code == 403
    assert db_scalar('SELECT count(*) FROM resq_community_rooms WHERE region=:r', r=room) == 0


# ---- retention -------------------------------------------------------------------------------------------------------
def test_purge_deletes_only_where_retention_is_set():
    c, h, _ = actor('citizen'); keep_room, purge_room = room_name(), room_name()
    ids = {}
    for room in (keep_room, purge_room):
        ids[room] = c.post(f'/api/community/chat?room={room}', headers=h, json={'content': f'old message in {room}'}).json()['message']['id']
        fresh = c.post(f'/api/community/chat?room={room}', headers=h, json={'content': 'fresh'}).json()['message']['id']
        ids[room + 'fresh'] = fresh
    with engine.begin() as db:
        db.execute(text("UPDATE resq_community_messages SET created_at = now() - interval '400 days' WHERE id IN (:a,:b)"), {'a': ids[keep_room], 'b': ids[purge_room]})
        db.execute(text("UPDATE resq_community_rooms SET retention_days=30 WHERE region=:r"), {'r': purge_room})
        deleted = purge_expired_messages(db)
    assert deleted >= 1
    assert db_scalar('SELECT count(*) FROM resq_community_messages WHERE id=:i', i=ids[purge_room]) == 0
    assert db_scalar('SELECT count(*) FROM resq_community_messages WHERE id=:i', i=ids[keep_room]) == 1      # retention not set: never deleted
    assert db_scalar('SELECT count(*) FROM resq_community_messages WHERE id=:i', i=ids[purge_room + 'fresh']) == 1


def test_purge_script_runs():
    from scripts import purge_chat
    assert purge_chat.main() >= 0


# ---- sanctions -------------------------------------------------------------------------------------------------------
def test_mute_blocks_every_write_with_reason_and_end_then_lift_restores():
    c, h, uid = actor('citizen'); other, oh, _ = actor('citizen'); mod, mh, _ = staff(); pid = make_post(other, oh)['post']['id']
    assert c.post('/api/community/sanctions', headers=h, json={'user_id': uid, 'kind': 'mute', 'reason': 'self'}).status_code == 403
    assert mod.post('/api/community/sanctions', headers=mh, json={'user_id': uid, 'kind': 'mute', 'reason': 'x'}).status_code == 422
    r = mod.post('/api/community/sanctions', headers=mh, json={'user_id': uid, 'kind': 'mute', 'reason': 'Repeated rude replies', 'hours': 2})
    assert r.status_code == 201 and r.json()['sanction']['until']
    sid = r.json()['sanction']['id']
    attempts = [c.post('/api/community/posts', headers=h, json={'content': 'hello there'}), c.post(f'/api/community/posts/{pid}/comments', headers=h, json={'content': 'hi'}),
                c.post(f'/api/community/chat?room={room_name()}', headers=h, json={'content': 'hi'}), c.post(f'/api/community/posts/{pid}/helpful', headers=h)]
    for a in attempts:
        assert a.status_code == 403 and 'Repeated rude replies' in a.json()['detail'] and 'muted until 20' in a.json()['detail']
    assert c.get('/api/community/posts', headers=h).status_code == 200                                             # reading is allowed
    assert [s['active'] for s in mod.get(f'/api/community/sanctions?user_id={uid}', headers=mh).json()['items']] == [True]
    assert c.get(f'/api/community/sanctions?user_id={uid}', headers=h).status_code == 403
    assert mod.post(f'/api/community/sanctions/{sid}/lift', headers=mh).json()['sanction']['lifted_at']
    assert c.post('/api/community/posts', headers=h, json={'content': 'hello again'}).status_code == 201
    assert db_scalar("SELECT count(*) FROM resq_audit_log WHERE action IN ('community_mute','community_sanction_lifted') AND entity_id=:e", e=str(sid)) == 2


def test_open_ended_mute_and_expired_mute():
    c, h, uid = actor('citizen'); mod, mh, _ = staff()
    sid = mod.post('/api/community/sanctions', headers=mh, json={'user_id': uid, 'kind': 'mute', 'reason': 'Spam links'}).json()['sanction']['id']
    r = c.post('/api/community/posts', headers=h, json={'content': 'hello there'})
    assert r.status_code == 403 and 'until a moderator lifts it' in r.json()['detail']
    with engine.begin() as db:
        db.execute(text("UPDATE resq_community_sanctions SET until = now() - interval '1 minute' WHERE id=:i"), {'i': sid})
    assert c.post('/api/community/posts', headers=h, json={'content': 'hello there'}).status_code == 201


def test_warn_notifies_the_user_and_does_not_block():
    c, h, uid = actor('citizen'); mod, mh, _ = staff()
    r = mod.post('/api/community/sanctions', headers=mh, json={'user_id': uid, 'kind': 'warn', 'reason': 'Please keep replies civil'})
    assert r.status_code == 201 and r.json()['sanction']['until'] is None
    assert 'Please keep replies civil' in db_scalar("SELECT message FROM resq_alerts WHERE user_id=:u AND kind='community_warning'", u=uid)
    assert c.post('/api/community/posts', headers=h, json={'content': 'still allowed'}).status_code == 201
    assert mod.post('/api/community/sanctions', headers=mh, json={'user_id': 99999999, 'kind': 'warn', 'reason': 'abc'}).status_code == 404


def test_only_admin_sanctions_staff():
    mod, mh, _ = staff(); admin, ah, _ = staff('admin'); _, _, other_staff = staff('incident_commander')
    assert mod.post('/api/community/sanctions', headers=mh, json={'user_id': other_staff, 'kind': 'mute', 'reason': 'abc'}).status_code == 403
    assert admin.post('/api/community/sanctions', headers=ah, json={'user_id': other_staff, 'kind': 'warn', 'reason': 'abc'}).status_code == 201


# ---- queue order and details -----------------------------------------------------------------------------------------
def test_queue_orders_unsafe_and_harassment_then_held_then_other_and_shows_author_history():
    clear_queue()
    author, ah, aid = actor('citizen'); rep, rh, _ = actor('citizen'); mod, mh, _ = staff()
    old = make_post(author, ah, 'Plain old post a')['post']['id']
    held = make_post(author, ah, 'Phone 9876543210')['post']['id']
    unsafe = make_post(author, ah, 'Set your own backburn tonight')['post']['id']
    harass = make_post(author, ah, 'You are all fools')['post']['id']
    assert rep.post(f'/api/community/posts/{old}/report', headers=rh, json={'reason': 'Off topic'}).status_code == 201
    assert rep.post(f'/api/community/posts/{unsafe}/report', headers=rh, json={'reason': 'Unsafe advice'}).status_code == 201
    assert rep.post(f'/api/community/posts/{harass}/report', headers=rh, json={'reason': 'Harassment'}).status_code == 201
    prior = make_post(author, ah, 'Earlier bad post')['post']['id']
    assert mod.request('DELETE', f'/api/community/posts/{prior}', headers=mh, json={'reason': 'Spam'}).status_code == 200
    items = [q for q in mod.get('/api/community/moderation/queue', headers=mh).json()['items'] if q['post_id'] in {old, held, unsafe, harass}]
    assert [q['severity'] for q in items] == ['high', 'high', 'held', 'normal'] and {items[0]['post_id'], items[1]['post_id']} == {unsafe, harass}
    assert items[2]['post_id'] == held and items[3]['post_id'] == old
    assert all(q['author_id'] == aid and q['author_prior_removals'] == 1 and q['author_name'] == 'Test C.' and q['kind'] == 'post' for q in items)
    assert 'email' not in str(items)


# ---- privacy, badge, roles -------------------------------------------------------------------------------------------
def test_author_shown_as_first_name_and_initial_with_staff_badge_and_no_email():
    c, h, uid = actor('citizen'); mod, mh, mod_id = staff()
    with engine.begin() as db:
        db.execute(text("UPDATE resq_users SET name='Asha Rao' WHERE id=:i"), {'i': uid})
        db.execute(text("UPDATE resq_users SET name='Ravi Kumar Sahoo' WHERE id=:i"), {'i': mod_id})
    pid = make_post(c, h)['post']['id']
    reply = mod.post(f'/api/community/posts/{pid}/comments', headers=mh, json={'content': 'Thanks for asking, see the notices.'}).json()['comment']
    assert reply['badge'] == 'Staff' and reply['author']['name'] == 'Ravi K.'
    post = next(i for i in c.get('/api/community/posts', headers=h).json()['items'] if i['id'] == pid)
    assert post['author'] == {'id': uid, 'name': 'Asha R.'} and post['badge'] is None
    comments = c.get(f'/api/community/posts/{pid}/comments', headers=h).json()['items']
    assert comments[0]['badge'] == 'Staff' and comments[0]['author']['name'] == 'Ravi K.'
    msg = mod.post(f'/api/community/chat?room={room_name()}', headers=mh, json={'content': 'Road is open'}).json()['message']
    assert msg['badge'] == 'Staff'
    email = db_scalar('SELECT email FROM resq_users WHERE id=:i', i=uid)
    assert email not in c.get('/api/community/posts', headers=h).text and email not in c.get(f'/api/community/posts/{pid}/comments', headers=h).text


def test_deleted_account_shows_as_deleted_member():
    from app.routers.community import _shape
    shaped = _shape({'author_id': 5, 'author_exists': None, 'author_name': None, 'author_role': None, 'status': 'published', 'content': 'x'})
    assert shaped['author'] == {'id': 5, 'name': 'Deleted member'}


@pytest.mark.parametrize('role', ['field_crew', 'range_officer'])
def test_field_roles_cannot_use_community(role):
    o, oh, _ = actor(role); c, h, _ = actor('citizen'); pid = make_post(c, h)['post']['id']
    calls = [o.post('/api/community/posts', headers=oh, json={'content': 'hello there'}), o.get('/api/community/posts', headers=oh), o.get(f'/api/community/posts/{pid}/comments', headers=oh),
             o.post(f'/api/community/posts/{pid}/comments', headers=oh, json={'content': 'hi'}), o.post(f'/api/community/posts/{pid}/helpful', headers=oh),
             o.get('/api/community/chat', headers=oh), o.post('/api/community/chat', headers=oh, json={'content': 'hi'}), o.get('/api/community/rooms', headers=oh),
             o.post(f'/api/community/posts/{pid}/report', headers=oh, json={'reason': 'x'}), o.get('/api/community/moderation/queue', headers=oh), o.get('/api/community/sanctions', headers=oh)]
    assert [x.status_code for x in calls] == [403] * len(calls)


@pytest.mark.parametrize('role', ['control_room_operator', 'incident_commander', 'admin'])
def test_staff_roles_may_use_community(role):
    s, sh, _ = staff(role)
    assert s.get('/api/community/posts', headers=sh).status_code == 200 and s.post('/api/community/posts', headers=sh, json={'content': 'Staff note on safety'}).status_code == 201


# ---- rate limits ----------------------------------------------------------------------------------------------------
def test_new_accounts_get_a_stricter_limit_only_when_configured(monkeypatch):
    c, h, _ = actor('citizen')
    for _ in range(4):
        assert c.post('/api/community/posts', headers=h, json={'content': 'hello there'}).status_code == 201     # unset: normal limit (10)
    monkeypatch.setenv('COMMUNITY_NEW_ACCOUNT_HOURS', '24')
    assert c.post('/api/community/posts', headers=h, json={'content': 'hello there'}).status_code == 429          # 4 already >= 3
    monkeypatch.setenv('COMMUNITY_NEW_ACCOUNT_LIMIT', '6')
    assert c.post('/api/community/posts', headers=h, json={'content': 'hello there'}).status_code == 201
    mod, mh, _ = staff()
    for _ in range(4):
        assert mod.post('/api/community/posts', headers=mh, json={'content': 'staff note here'}).status_code == 201
    monkeypatch.delenv('COMMUNITY_NEW_ACCOUNT_HOURS')


def test_normal_rate_limit_still_applies():
    c, h, _ = actor('citizen')
    codes = [c.post('/api/community/posts', headers=h, json={'content': 'hello there'}).status_code for _ in range(11)]
    assert codes[:10] == [201] * 10 and codes[10] == 429
