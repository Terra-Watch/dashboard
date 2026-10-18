"""Compatibility boundary tests for risk-map authentication; no database is used."""
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest import mock

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))

import jwt
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core import security


TEST_KEY = "test-only-signing-secret-longer-than-thirty-two-bytes"


class RiskTokenCompatibilityTests(unittest.TestCase):
    def setUp(self):
        self.key_patch = mock.patch.object(security, "RESQ_SECRET_KEY", TEST_KEY)
        self.key_patch.start()
        self.addCleanup(self.key_patch.stop)
        active = mock.patch.object(security, "_confirm_active", side_effect=lambda identity: identity)   # account checks are tested in test_admin
        active.start()
        self.addCleanup(active.stop)

    def credentials(self, token: str) -> HTTPAuthorizationCredentials:
        return HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    def test_valid_legacy_admin_token_is_accepted_for_risk_authentication(self):
        token = security.make_token(7, "admin")
        self.assertEqual(
            security.current_risk_user(self.credentials(token)),
            {"id": 7, "role": "admin"},
        )

    def test_valid_redesign_access_token_remains_accepted(self):
        token = security.make_access_token(8, "range_officer")
        self.assertEqual(
            security.current_risk_user(self.credentials(token)),
            {"id": 8, "role": "range_officer"},
        )

    def test_invalid_signature_is_rejected(self):
        token = jwt.encode(
            {"sub": "7", "role": "admin", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)},
            "different-test-signing-key-that-is-also-long-enough",
            algorithm="HS256",
        )
        with self.assertRaises(HTTPException) as caught:
            security.current_risk_user(self.credentials(token))
        self.assertEqual(caught.exception.status_code, 401)

    def test_expired_legacy_token_is_rejected(self):
        token = jwt.encode(
            {"sub": "7", "role": "admin", "exp": datetime.now(timezone.utc) - timedelta(seconds=1)},
            TEST_KEY,
            algorithm="HS256",
        )
        with self.assertRaises(HTTPException) as caught:
            security.current_risk_user(self.credentials(token))
        self.assertEqual(caught.exception.status_code, 401)

    def test_missing_expiry_is_rejected_by_risk_adapter(self):
        token = jwt.encode({"sub": "7", "role": "admin"}, TEST_KEY, algorithm="HS256")
        with self.assertRaises(HTTPException) as caught:
            security.current_risk_user(self.credentials(token))
        self.assertEqual(caught.exception.status_code, 401)

    def test_legacy_officer_is_authenticated_but_not_mapped_to_risk_role(self):
        token = security.make_token(9, "officer")
        user = security.current_risk_user(self.credentials(token))
        with self.assertRaises(HTTPException) as caught:
            security.require_risk_roles("range_officer")(user)
        self.assertEqual(caught.exception.status_code, 403)

    def test_non_access_typed_token_is_rejected(self):
        token = jwt.encode(
            {
                "sub": "7", "role": "admin", "typ": "refresh",
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            },
            TEST_KEY,
            algorithm="HS256",
        )
        with self.assertRaises(HTTPException) as caught:
            security.current_risk_user(self.credentials(token))
        self.assertEqual(caught.exception.status_code, 401)

    def test_signed_token_with_non_integer_subject_is_rejected_as_unauthorized(self):
        token = jwt.encode(
            {
                "sub": None, "role": "admin", "typ": "access",
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            },
            TEST_KEY,
            algorithm="HS256",
        )
        with self.assertRaises(HTTPException) as caught:
            security.current_risk_user(self.credentials(token))
        self.assertEqual(caught.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
