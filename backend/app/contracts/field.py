from pydantic import Field

from .schemas import VerificationRequest


class FieldObservationRequest(VerificationRequest):
    """A Range Officer's observation. The idempotency key lets a phone that retried after a lost connection avoid saving it twice."""
    idempotency_key: str | None = Field(default=None, min_length=8, max_length=120)
