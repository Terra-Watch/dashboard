from uuid import uuid4

from app.core.security import hash_password, verify_password
from app.schemas.mobile_crew import SosRequest, SyncRequest


def test_passwords_are_hashed_and_verifiable() -> None:
    encoded = hash_password("correct horse battery staple")
    assert encoded != "correct horse battery staple"
    assert verify_password("correct horse battery staple", encoded)
    assert not verify_password("wrong", encoded)


def test_sos_and_sync_contracts_require_client_event_ids() -> None:
    event_id = uuid4()
    request = SosRequest(clientEventId=event_id)
    sync = SyncRequest(operations=[{"operation": "SOS_CREATE", "clientEventId": event_id}])
    assert request.clientEventId == event_id
    assert sync.operations[0].operation == "SOS_CREATE"
