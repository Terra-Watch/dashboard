"""The bridge's line parser and signature (the same line format the gateway firmware prints)."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import station_bridge as b  # noqa: E402

LINE = "[DATA RX] source=0x01 sequence=4 rssi=-60 snr=9.5 payload=530103120019000000FFFF1D0BD01BFFFF"


def test_parses_a_gateway_line_and_ignores_others():
    r = b.parse_line(LINE); assert r["node_id"] == 1 and r["seq"] == 4 and r["rssi"] == -60 and r["snr"] == 9.5 and r["payload_hex"].startswith("5301")
    assert b.parse_line("[HEARTBEAT RX] source: 0x01") is None and b.parse_line("") is None


def test_signature_matches_the_server_rule():
    import hashlib, hmac
    assert b.sign("k", b"abc") == hmac.new(b"k", b"abc", hashlib.sha256).hexdigest()
