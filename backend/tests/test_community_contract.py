"""Community boundaries: bounded plain text and no incident-dispatch contract."""
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.contracts.schemas import CommunityCommentRequest, CommunityMessageRequest, CommunityPostRequest  # noqa: E402


def test_community_content_is_bounded_and_non_empty():
    assert CommunityPostRequest(content='Preparedness update').content == 'Preparedness update'
    assert CommunityCommentRequest(content='Thanks').content == 'Thanks'
    assert CommunityMessageRequest(content='Stay safe').content == 'Stay safe'
    with pytest.raises(ValidationError):
        CommunityPostRequest(content='')
    with pytest.raises(ValidationError):
        CommunityMessageRequest(content='x' * 1001)


def test_community_router_does_not_share_incident_creation_route():
    from app.routers.community import router

    routes = {route.path for route in router.routes}
    assert '/api/community/posts' in routes
    assert '/api/community/chat' in routes
    assert not any('/incidents' in route for route in routes)
