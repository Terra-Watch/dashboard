from fastapi.testclient import TestClient

from app.main import app


def test_an_unexpected_error_returns_a_reference_and_no_internals():
    @app.get("/_test_boom")
    def boom():
        raise RuntimeError("secret internal detail")
    response = TestClient(app, raise_server_exceptions=False).get("/_test_boom")
    body = response.json()
    assert response.status_code == 500 and len(body["ref"]) == 8 and body["ref"] in body["detail"]
    assert "secret internal detail" not in response.text
