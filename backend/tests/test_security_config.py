"""Authentication must fail closed when no explicit token-signing key exists."""
import sys
import unittest
from pathlib import Path
from unittest import mock

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))


class SigningKeyConfigurationTests(unittest.TestCase):
    def test_token_issuance_fails_closed_without_configured_key(self):
        from app.core import security
        from fastapi import HTTPException

        with mock.patch.object(security, "RESQ_SECRET_KEY", None):
            with self.assertRaises(HTTPException) as caught:
                security.make_token(7, "officer")
        self.assertEqual(caught.exception.status_code, 503)

    def test_short_signing_key_is_rejected(self):
        from app.core import security
        from fastapi import HTTPException

        with mock.patch.object(security, "RESQ_SECRET_KEY", "short-key"):
            with self.assertRaises(HTTPException) as caught:
                security.make_token(7, "officer")
        self.assertEqual(caught.exception.status_code, 503)

    def test_authenticated_requests_fail_closed_without_configured_key(self):
        from app.core import security
        from fastapi import HTTPException
        from fastapi.security import HTTPAuthorizationCredentials

        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials="old-token")
        with mock.patch.object(security, "RESQ_SECRET_KEY", None):
            with self.assertRaises(HTTPException) as caught:
                security.current_user(credentials)
        self.assertEqual(caught.exception.status_code, 503)

    def test_missing_credentials_remain_401_when_key_is_unconfigured(self):
        from app.core import security
        from fastapi import HTTPException

        with mock.patch.object(security, "RESQ_SECRET_KEY", None):
            with self.assertRaises(HTTPException) as caught:
                security.current_user(None)
        self.assertEqual(caught.exception.status_code, 401)

    def test_explicit_key_supports_token_issue_and_authentication(self):
        from app.core import security
        from fastapi.security import HTTPAuthorizationCredentials

        with mock.patch.object(security, "RESQ_SECRET_KEY", "test-only-signing-secret-with-over-32-bytes"), \
                mock.patch.object(security, "_confirm_active", side_effect=lambda identity: identity):
            token = security.make_token(7, "officer")
            user = security.current_user(
                HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
            )
        self.assertEqual(user, {"id": 7, "role": "officer"})

    def test_signed_token_without_expiration_is_rejected(self):
        from app.core import security
        from fastapi import HTTPException
        from fastapi.security import HTTPAuthorizationCredentials
        import jwt

        key = "test-only-signing-secret-with-over-32-bytes"
        token = jwt.encode({"sub": "7", "role": "officer"}, key, algorithm="HS256")
        with mock.patch.object(security, "RESQ_SECRET_KEY", key):
            with self.assertRaises(HTTPException) as caught:
                security.current_user(
                    HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
                )
        self.assertEqual(caught.exception.status_code, 401)

    def test_signed_redesign_access_token_without_expiration_is_rejected(self):
        from app.core import security
        from fastapi import HTTPException
        import jwt

        key = "test-only-signing-secret-with-over-32-bytes"
        token = jwt.encode(
            {"sub": "7", "role": "range_officer", "typ": "access"},
            key,
            algorithm="HS256",
        )
        with mock.patch.object(security, "RESQ_SECRET_KEY", key):
            with self.assertRaises(HTTPException) as caught:
                security.decode_access_token(token)
        self.assertEqual(caught.exception.status_code, 401)

    def test_signed_tokens_with_non_integer_subjects_are_rejected_as_unauthorized(self):
        from app.core import security
        from fastapi import HTTPException
        from fastapi.security import HTTPAuthorizationCredentials
        import jwt
        from datetime import datetime, timedelta, timezone

        key = "test-only-signing-secret-with-over-32-bytes"
        credential_cases = (
            ("legacy", {"sub": None, "role": "admin"}),
            ("access", {"sub": None, "role": "admin", "typ": "access"}),
        )
        with mock.patch.object(security, "RESQ_SECRET_KEY", key):
            for label, claims in credential_cases:
                with self.subTest(token_type=label):
                    token = jwt.encode(
                        {**claims, "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
                        key,
                        algorithm="HS256",
                    )
                    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
                    validators = (security.current_user, security.current_risk_user)
                    if label == "access":
                        validators += (security.current_redesign_user,)
                    for validator in validators:
                        with self.subTest(validator=validator.__name__), self.assertRaises(HTTPException) as caught:
                            validator(credentials)
                        self.assertEqual(caught.exception.status_code, 401)

    def test_redesign_access_token_is_not_a_legacy_session(self):
        from app.core import security
        from fastapi import HTTPException
        from fastapi.security import HTTPAuthorizationCredentials

        key = "test-only-signing-secret-with-over-32-bytes"
        with mock.patch.object(security, "RESQ_SECRET_KEY", key):
            token = security.make_access_token(7, "admin")
            with self.assertRaises(HTTPException) as caught:
                security.current_user(
                    HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
                )
        self.assertEqual(caught.exception.status_code, 401)

    def test_unapproved_redesign_roles_do_not_gain_legacy_write_access(self):
        from app.core import security
        from fastapi import HTTPException

        for role in ("range_officer", "control_room_operator"):
            with self.subTest(role=role), self.assertRaises(HTTPException) as caught:
                security.require_write({"id": 7, "role": role})
            self.assertEqual(caught.exception.status_code, 403)

        self.assertEqual(security.require_write({"id": 7, "role": "officer"})["role"], "officer")


if __name__ == "__main__":
    unittest.main()
