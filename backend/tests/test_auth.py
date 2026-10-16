"""Step 1a auth: permission matrix per role, rate limiting/lockout, CSRF, refresh-token
rotation/reuse detection, invite/reset single-use tokens, scope enforcement, audit log.
"""
import sys
import uuid
from pathlib import Path

import bcrypt
from fastapi.testclient import TestClient
from sqlalchemy import text

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

from app.database.session import engine, init_db  # noqa: E402
from app.core.security import current_redesign_user, current_risk_user  # noqa: E402
from app.main import app  # noqa: E402
from app.services import audit_log, redesign_data  # noqa: E402

import unittest  # noqa: E402

ROLES = ['range_officer', 'control_room_operator', 'field_crew', 'incident_commander']


def make_user(role: str, scopes: list[str] | None = None, password: str = 'test-pass-123') -> tuple[int, str]:
    email = f"test-{uuid.uuid4().hex[:10]}@resq.local"
    with engine.begin() as db:
        user_id = db.execute(
            text(
                "INSERT INTO resq_users (email, name, password_hash, role, password_algo) "
                "VALUES (:email, 'Test user', :hash, :role, 'bcrypt') RETURNING id"
            ),
            {'email': email, 'hash': bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(), 'role': role},
        ).scalar()
        for state in (scopes or []):
            db.execute(text("INSERT INTO resq_user_scopes (user_id, state) VALUES (:uid, :state)"), {'uid': user_id, 'state': state})
    return user_id, email


def fresh_client() -> TestClient:
    return TestClient(app, base_url="https://testserver")


def login(client: TestClient, email: str, password: str = 'test-pass-123'):
    return client.post('/api/auth/redesign/login', json={'email': email, 'password': password})


def csrf_headers(client: TestClient) -> dict:
    return {'x-resq-csrf': client.cookies.get('resq_csrf')}


class SetUpDB(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()

    def setUp(self):
        with engine.begin() as db:
            db.execute(text("DELETE FROM resq_login_attempts"))


class LoginTests(SetUpDB):
    def test_valid_login_issues_token_and_cookies(self):
        _, email = make_user('range_officer')
        client = fresh_client()
        resp = login(client, email)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()['access_token'])
        self.assertIn('resq_refresh', resp.cookies)
        self.assertIn('resq_csrf', resp.cookies)

    def test_wrong_password_and_unknown_email_give_identical_generic_message(self):
        _, email = make_user('range_officer')
        client = fresh_client()
        wrong_pw = login(client, email, password='not-the-password')
        unknown = login(fresh_client(), 'no-such-user@resq.local')
        self.assertEqual(wrong_pw.status_code, 401)
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(wrong_pw.json()['detail'], unknown.json()['detail'])
        self.assertNotIn('exist', wrong_pw.json()['detail'].lower())

    def test_legacy_role_cannot_use_redesign_login(self):
        resp = login(fresh_client(), 'admin@resq.local', password='resq-demo')
        self.assertEqual(resp.status_code, 200)
        officer_resp = login(fresh_client(), 'officer@resq.local', password='resq-demo')
        self.assertEqual(officer_resp.status_code, 401)

    def test_lockout_after_five_failed_attempts(self):
        _, email = make_user('range_officer')
        client = fresh_client()
        for _ in range(5):
            resp = login(client, email, password='wrong')
            self.assertEqual(resp.status_code, 401)
        locked = login(client, email, password='wrong')
        self.assertEqual(locked.status_code, 429)
        still_locked = login(client, email)
        self.assertEqual(still_locked.status_code, 429)


class RefreshRotationTests(SetUpDB):
    def test_refresh_rotates_and_old_token_reuse_is_detected(self):
        _, email = make_user('range_officer')
        client = fresh_client()
        login(client, email)
        first_refresh_cookie = client.cookies.get('resq_refresh')

        refreshed = client.post('/api/auth/refresh')
        self.assertEqual(refreshed.status_code, 200)
        self.assertNotEqual(client.cookies.get('resq_refresh'), first_refresh_cookie)

        replay_client = fresh_client()
        replay_client.cookies.set('resq_refresh', first_refresh_cookie)
        reuse_resp = replay_client.post('/api/auth/refresh')
        self.assertEqual(reuse_resp.status_code, 401)

        now_dead_client = fresh_client()
        now_dead_client.cookies.set('resq_refresh', client.cookies.get('resq_refresh'))
        self.assertEqual(now_dead_client.post('/api/auth/refresh').status_code, 401)

    def test_refresh_with_no_cookie_is_401(self):
        self.assertEqual(fresh_client().post('/api/auth/refresh').status_code, 401)


class CsrfTests(SetUpDB):
    def test_logout_requires_csrf_header(self):
        _, email = make_user('range_officer')
        client = fresh_client()
        token = login(client, email).json()['access_token']
        bearer = {'Authorization': f'Bearer {token}'}
        no_csrf = client.post('/api/auth/logout', headers=bearer)
        self.assertEqual(no_csrf.status_code, 403)
        with_csrf = client.post('/api/auth/logout', headers={**bearer, **csrf_headers(client)})
        self.assertEqual(with_csrf.status_code, 200)

    def test_wrong_csrf_value_rejected(self):
        _, email = make_user('range_officer')
        client = fresh_client()
        login(client, email)
        resp = client.post('/api/auth/logout', headers={'x-resq-csrf': 'not-the-real-token'})
        self.assertEqual(resp.status_code, 403)


def _authed_headers(client: TestClient, email: str, password: str = 'test-pass-123') -> dict:
    if email == 'admin@resq.local':
        password = 'resq-demo'
    token = login(client, email, password=password).json()['access_token']
    return {'Authorization': f'Bearer {token}'}


class PermissionMatrixTests(SetUpDB):
    def test_risk_geojson_allowed_roles(self):
        for role in ('range_officer', 'control_room_operator', 'incident_commander'):
            _, email = make_user(role)
            client = fresh_client()
            resp = client.get('/api/risk/geojson?target=2023-03-10', headers=_authed_headers(client, email))
            self.assertEqual(resp.status_code, 200, f"{role} should be allowed on /api/risk/geojson")

    def test_risk_geojson_denies_field_crew(self):
        _, email = make_user('field_crew')
        client = fresh_client()
        resp = client.get('/api/risk/geojson?target=2023-03-10', headers=_authed_headers(client, email))
        self.assertEqual(resp.status_code, 403)

    def test_detections_list_allowed_and_denied_roles(self):
        for role in ('range_officer', 'control_room_operator', 'incident_commander'):
            _, email = make_user(role)
            client = fresh_client()
            resp = client.get('/api/redesign/detections', headers=_authed_headers(client, email))
            self.assertEqual(resp.status_code, 200, f"{role} should read Watch")
        _, fc_email = make_user('field_crew', scopes=['OD'])
        client = fresh_client()
        resp = client.get('/api/redesign/detections', headers=_authed_headers(client, fc_email))
        self.assertEqual(resp.status_code, 403)

    def test_only_control_room_operator_can_act_on_detections(self):
        detection_id = next(item['id'] for item in redesign_data.list_detections())
        allowed_client = fresh_client()
        _, cro_email = make_user('control_room_operator', scopes=['OD', 'CG', 'TS', 'MP', 'MH', 'JH'])
        headers = _authed_headers(allowed_client, cro_email)
        headers_csrf = {**headers, **csrf_headers(allowed_client)}
        ok = allowed_client.post(f'/api/redesign/detections/{detection_id}/actions', json={'action': 'verify', 'role': 'control_room_operator', 'device_id': 'dev1'}, headers=headers_csrf)
        self.assertEqual(ok.status_code, 200)

        for role in ('range_officer', 'incident_commander', 'field_crew'):
            _, email = make_user(role)
            client = fresh_client()
            headers = {**_authed_headers(client, email), **csrf_headers(client)}
            resp = client.post(f'/api/redesign/detections/{detection_id}/actions', json={'action': 'verify', 'role': role, 'device_id': 'dev1'}, headers=headers)
            self.assertEqual(resp.status_code, 403, f"{role} must not be able to act on a detection")

    def test_only_field_crew_sees_field_tasks(self):
        _, fc_email = make_user('field_crew', scopes=['OD'])
        client = fresh_client()
        self.assertEqual(client.get('/api/redesign/field/tasks', headers=_authed_headers(client, fc_email)).status_code, 200)
        for role in ('range_officer', 'control_room_operator', 'incident_commander'):
            _, email = make_user(role)
            client2 = fresh_client()
            self.assertEqual(client2.get('/api/redesign/field/tasks', headers=_authed_headers(client2, email)).status_code, 403)

    def test_unauthenticated_request_is_401(self):
        self.assertEqual(fresh_client().get('/api/redesign/detections').status_code, 401)


class ScopeTests(SetUpDB):
    def test_out_of_scope_detection_is_403_and_audited(self):
        detections = redesign_data.list_detections()
        od_detection = next(item for item in detections if item['state'] == 'OD')
        _, cro_email = make_user('control_room_operator', scopes=['TS'])  # no OD scope
        client = fresh_client()
        headers = {**_authed_headers(client, cro_email), **csrf_headers(client)}
        resp = client.post(f"/api/redesign/detections/{od_detection['id']}/actions", json={'action': 'verify', 'role': 'control_room_operator', 'device_id': 'd1'}, headers=headers)
        self.assertEqual(resp.status_code, 403)
        entry = audit_log.get_latest_action('detection', od_detection['id'])
        self.assertIsNotNone(entry)
        self.assertEqual(entry.action, 'out_of_division_access_denied')

    def test_detections_list_is_filtered_to_scope(self):
        _, email = make_user('control_room_operator', scopes=['OD'])
        client = fresh_client()
        resp = client.get('/api/redesign/detections', headers=_authed_headers(client, email))
        self.assertEqual(resp.status_code, 200)
        states = {item['state'] for item in resp.json()['items']}
        self.assertTrue(states.issubset({'OD'}))

    def test_admin_bypasses_scope(self):
        client = fresh_client()
        headers = _authed_headers(client, 'admin@resq.local')
        resp = client.get('/api/redesign/detections', headers=headers)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(len(resp.json()['items']) >= 1)


class InviteAndResetTokenTests(SetUpDB):
    def _admin_headers(self, client: TestClient) -> dict:
        return _authed_headers(client, 'admin@resq.local')

    def test_invite_is_single_use_and_creates_an_account(self):
        client = fresh_client()
        headers = {**self._admin_headers(client), **csrf_headers(client)}
        email = f"invitee-{uuid.uuid4().hex[:8]}@resq.local"
        created = client.post('/api/auth/invites', json={'email': email, 'role': 'range_officer', 'scopes': ['OD']}, headers=headers)
        self.assertEqual(created.status_code, 200)
        token = created.json()['token']

        accept1 = fresh_client().post(f'/api/auth/invites/{token}/accept', json={'password': 'a-new-password1'})
        self.assertEqual(accept1.status_code, 200)

        accept2 = fresh_client().post(f'/api/auth/invites/{token}/accept', json={'password': 'another-password2'})
        self.assertEqual(accept2.status_code, 400)

        login_resp = login(fresh_client(), email, password='a-new-password1')
        self.assertEqual(login_resp.status_code, 200)

    def test_expired_invite_is_rejected(self):
        client = fresh_client()
        headers = {**self._admin_headers(client), **csrf_headers(client)}
        email = f"expired-{uuid.uuid4().hex[:8]}@resq.local"
        created = client.post('/api/auth/invites', json={'email': email, 'role': 'range_officer', 'scopes': []}, headers=headers)
        token = created.json()['token']
        with engine.begin() as db:
            db.execute(text("UPDATE resq_invites SET expires_at = now() - interval '1 day' WHERE email=:email"), {'email': email})
        resp = fresh_client().post(f'/api/auth/invites/{token}/accept', json={'password': 'whatever-password'})
        self.assertEqual(resp.status_code, 400)

    def test_admin_password_reset_is_single_use(self):
        user_id, email = make_user('range_officer')
        client = fresh_client()
        headers = {**self._admin_headers(client), **csrf_headers(client)}
        initiated = client.post('/api/auth/password-reset/admin-initiate', json={'user_id': user_id}, headers=headers)
        self.assertEqual(initiated.status_code, 200)
        token = initiated.json()['token']

        complete1 = fresh_client().post(f'/api/auth/password-reset/{token}/complete', json={'password': 'brand-new-password1'})
        self.assertEqual(complete1.status_code, 200)
        complete2 = fresh_client().post(f'/api/auth/password-reset/{token}/complete', json={'password': 'another-one-entirely'})
        self.assertEqual(complete2.status_code, 400)

        self.assertEqual(login(fresh_client(), email, password='brand-new-password1').status_code, 200)

    def test_non_admin_cannot_create_invites(self):
        _, email = make_user('range_officer')
        client = fresh_client()
        headers = {**_authed_headers(client, email), **csrf_headers(client)}
        resp = client.post('/api/auth/invites', json={'email': 'x@resq.local', 'role': 'range_officer', 'scopes': []}, headers=headers)
        self.assertEqual(resp.status_code, 403)


class AuditLogTests(SetUpDB):
    def test_login_events_are_written_and_readable_by_admin(self):
        _, email = make_user('range_officer')
        client = fresh_client()
        login(client, email)
        login(fresh_client(), email, password='wrong-password')

        admin_client = fresh_client()
        headers = _authed_headers(admin_client, 'admin@resq.local')
        resp = admin_client.get('/api/auth/audit-log?action=login_success', headers=headers)
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(any(item['action'] == 'login_success' for item in resp.json()['items']))

        resp2 = admin_client.get('/api/auth/audit-log?action=login_failed', headers=headers)
        self.assertTrue(any(item['action'] == 'login_failed' for item in resp2.json()['items']))

    def test_non_admin_cannot_read_audit_log(self):
        _, email = make_user('range_officer')
        client = fresh_client()
        resp = client.get('/api/auth/audit-log', headers=_authed_headers(client, email))
        self.assertEqual(resp.status_code, 403)

    def test_get_latest_actions_bulk_matches_single(self):
        audit_log.write_audit_log(action='verify', entity_type='detection', entity_id='bulk-test-1', previous_state='new')
        audit_log.write_audit_log(action='dismiss', entity_type='detection', entity_id='bulk-test-2', previous_state='new')
        bulk = audit_log.get_latest_actions('detection', ['bulk-test-1', 'bulk-test-2', 'bulk-test-missing'])
        self.assertEqual(bulk['bulk-test-1'].action, 'verify')
        self.assertEqual(bulk['bulk-test-2'].action, 'dismiss')
        self.assertNotIn('bulk-test-missing', bulk)


class FieldReportScopeTests(SetUpDB):
    def test_field_reports_list_is_filtered_to_scope(self):
        od_task = next(item['id'] for item in redesign_data.list_detections() if item['state'] == 'OD')
        _, fc_email = make_user('field_crew', scopes=['OD'])
        submitter = fresh_client()
        submit_headers = {**_authed_headers(submitter, fc_email), **csrf_headers(submitter)}
        key = uuid.uuid4().hex
        submitted = submitter.post(
            '/api/redesign/field/reports',
            json={'idempotency_key': key, 'task_id': od_task, 'note': 'test note', 'device_id': 'dev-1', 'captured_at': '2024-01-01T00:00:00Z'},
            headers=submit_headers,
        )
        self.assertEqual(submitted.status_code, 200)

        in_scope_client = fresh_client()
        _, in_scope_email = make_user('control_room_operator', scopes=['OD'])
        in_scope = in_scope_client.get('/api/redesign/field/reports', headers=_authed_headers(in_scope_client, in_scope_email))
        self.assertEqual(in_scope.status_code, 200)
        self.assertTrue(any(r['idempotency_key'] == key for r in in_scope.json()['items']))

        out_of_scope_client = fresh_client()
        _, out_of_scope_email = make_user('control_room_operator', scopes=['TS'])  # no OD
        out_of_scope = out_of_scope_client.get('/api/redesign/field/reports', headers=_authed_headers(out_of_scope_client, out_of_scope_email))
        self.assertEqual(out_of_scope.status_code, 200)
        self.assertFalse(any(r['idempotency_key'] == key for r in out_of_scope.json()['items']))

    def test_admin_sees_all_field_reports(self):
        client = fresh_client()
        resp = client.get('/api/redesign/field/reports', headers=_authed_headers(client, 'admin@resq.local'))
        self.assertEqual(resp.status_code, 200)


def _collect_dependency_calls(dependant) -> set:
    calls = {dependant.call}
    for sub in dependant.dependencies:
        calls |= _collect_dependency_calls(sub)
    return calls


class RouteCoverageTests(SetUpDB):
    ALLOWLIST = {
        ('POST', '/api/auth/login'),
        ('POST', '/api/auth/access-requests'),
        ('POST', '/api/auth/password-reset/request'),
        ('POST', '/api/auth/redesign/login'),
        ('POST', '/api/auth/citizen/register'),
        ('POST', '/api/auth/citizen/login'),
        ('POST', '/api/auth/refresh'),
        ('POST', '/api/auth/invites/{token}/accept'),
        ('POST', '/api/auth/password-reset/{token}/complete'),
    }

    # These routes are read-only and deliberately accept either signed token
    # contract through the risk-specific adapter. Its role gate and state-scope
    # filtering remain mandatory; no compatibility exception applies to writes.
    RISK_READ_COMPAT = {
        ('GET', '/api/risk/daily'),
        ('GET', '/api/risk/geojson'),
    }

    def test_every_redesign_risk_and_auth_route_requires_auth_unless_allowlisted(self):
        from fastapi.routing import APIRoute
        checked = 0
        for route in app.routes:
            if not isinstance(route, APIRoute):
                continue
            if not (route.path.startswith('/api/redesign') or route.path.startswith('/api/risk') or route.path.startswith('/api/auth')):
                continue
            for method in route.methods - {'HEAD', 'OPTIONS'}:
                checked += 1
                if (method, route.path) in self.ALLOWLIST:
                    continue
                calls = _collect_dependency_calls(route.dependant)
                if (method, route.path) in self.RISK_READ_COMPAT:
                    self.assertIn(
                        current_risk_user, calls,
                        f"{method} {route.path} must use the risk-read token adapter",
                    )
                    self.assertNotIn(
                        current_redesign_user, calls,
                        f"{method} {route.path} unexpectedly uses the general redesign dependency",
                    )
                    continue
                self.assertIn(
                    current_redesign_user, calls,
                    f"{method} {route.path} has no auth dependency and is not in the allowlist",
                )
        self.assertGreater(checked, 15, "route walk found suspiciously few routes — check the prefix filter")


if __name__ == '__main__':
    unittest.main()
