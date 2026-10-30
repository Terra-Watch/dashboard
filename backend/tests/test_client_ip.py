from types import SimpleNamespace

from app.core.security import client_ip


def req(headers, host="10.1.1.1"):
    return SimpleNamespace(headers={k.lower(): v for k, v in headers.items()}, client=SimpleNamespace(host=host))


def test_forwarded_address_is_believed_only_with_the_shared_secret(monkeypatch):
    monkeypatch.setenv("RESQ_PROXY_SECRET", "s3cret"); monkeypatch.delenv("VERCEL", raising=False)
    assert client_ip(req({"x-resq-proxy-secret": "s3cret", "x-resq-client-ip": "203.0.113.9"})) == "203.0.113.9"
    assert client_ip(req({"x-resq-proxy-secret": "wrong", "x-resq-client-ip": "203.0.113.9"})) == "10.1.1.1"
    assert client_ip(req({"x-resq-client-ip": "203.0.113.9"})) == "10.1.1.1"
    assert client_ip(req({"x-resq-proxy-secret": "s3cret", "x-resq-client-ip": "not-an-ip"})) == "10.1.1.1"


def test_without_a_configured_secret_the_header_is_ignored(monkeypatch):
    monkeypatch.delenv("RESQ_PROXY_SECRET", raising=False); monkeypatch.delenv("VERCEL", raising=False)
    assert client_ip(req({"x-resq-proxy-secret": "", "x-resq-client-ip": "203.0.113.9"})) == "10.1.1.1"
