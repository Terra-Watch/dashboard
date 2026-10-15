import unittest
from unittest.mock import patch

from app.services import alert_service


class _Result:
    def __init__(self, row=None):
        self.row = row

    def mappings(self):
        return self

    def first(self):
        return self.row

    def one(self):
        if self.row is None:
            raise AssertionError("expected an inserted alert row")
        return self.row


class _Connection:
    def __init__(self, existing=None):
        self.existing = existing
        self.statements = []

    def execute(self, statement, params=None):
        sql = str(statement)
        self.statements.append((sql, params or {}))
        if "pg_advisory_xact_lock" in sql:
            return _Result()
        if sql.lstrip().startswith("SELECT id, kind"):
            return _Result(self.existing)
        if sql.lstrip().startswith("INSERT INTO resq_alerts"):
            return _Result(
                {
                    "id": 92,
                    "kind": "incident",
                    "message": "new alert",
                    "state": "TS",
                    "severity": "warning",
                    "status": "generated",
                    "entity_type": "incident",
                    "entity_id": "17",
                    "read": False,
                    "created_at": "now",
                }
            )
        raise AssertionError(f"unexpected SQL: {sql}")


class _Engine:
    def __init__(self, connection):
        self.connection = connection

    def begin(self):
        return self

    def __enter__(self):
        return self.connection

    def __exit__(self, *exc_info):
        return False


class AlertServiceUnitTests(unittest.TestCase):
    def test_advisory_lock_precedes_dedupe_read_and_existing_alert_is_reused(self):
        existing = {
            "id": 41,
            "kind": "incident",
            "message": "existing alert",
            "state": "TS",
            "severity": "warning",
            "status": "acknowledged",
            "entity_type": "incident",
            "entity_id": "17",
            "created_at": "earlier",
        }
        connection = _Connection(existing)
        with patch.object(alert_service, "engine", _Engine(connection)):
            alert, created = alert_service.generate_alert(
                kind="incident",
                message="new alert",
                entity_type="incident",
                entity_id="17",
            )

        statements = [sql for sql, _ in connection.statements]
        self.assertIn("pg_advisory_xact_lock", statements[0])
        self.assertTrue(statements[1].lstrip().startswith("SELECT id, kind"))
        self.assertEqual(len(statements), 2)  # No INSERT for an active duplicate.
        self.assertEqual(alert, existing)
        self.assertFalse(created)
        self.assertEqual(
            connection.statements[0][1]["dedupe_key"],
            '["incident","17","incident"]',
        )

    def test_new_alert_is_inserted_after_lock_and_dedupe_miss(self):
        connection = _Connection()
        with (
            patch.object(alert_service, "engine", _Engine(connection)),
            patch.object(alert_service, "write_audit_log") as write_audit,
        ):
            alert, created = alert_service.generate_alert(
                kind="incident",
                message="new alert",
                entity_type="incident",
                entity_id=17,
            )

        statements = [sql for sql, _ in connection.statements]
        self.assertIn("pg_advisory_xact_lock", statements[0])
        self.assertTrue(statements[1].lstrip().startswith("SELECT id, kind"))
        self.assertTrue(statements[2].lstrip().startswith("INSERT INTO resq_alerts"))
        self.assertTrue(created)
        self.assertEqual(alert["id"], 92)
        write_audit.assert_called_once()


if __name__ == "__main__":
    unittest.main()
