# Jalri Firmware Communication Contract

**Verification status:** Software protocol compatibility verified. Physical RF communication not tested; hardware was unavailable.

## Radio configuration

BoatNode and Gateway compile with the same LoRa settings:

| Setting | BoatNode | Gateway |
|---|---:|---:|
| Frequency | 433 MHz | 433 MHz |
| Spreading factor | 7 | 7 |
| Bandwidth | 125 kHz | 125 kHz |
| Coding rate | 4/5 | 4/5 |
| Sync word | `0x12` | `0x12` |
| CRC | Enabled | Enabled |
| SPI SCK/MISO/MOSI | 12/13/11 | 12/13/11 |
| CS / RESET / DIO0 | 10/9/14 | 10/9/14 |

No radio configuration changes were required.

## Common packet format

Both implementations use the same serialized frame:

```text
byte 0    preamble       0xA5
byte 1    protocol        0x03
byte 2    packet type
byte 3    source ID
byte 4    destination ID
bytes 5-6 sequence       uint16, little-endian
byte 7    TTL
byte 8    hop count
byte 9    payload length
bytes 10.. payload
last 2    CRC-16/CCITT, little-endian
```

The maximum payload is 48 bytes. CRC is calculated over the header and payload, excluding the two CRC bytes.

## BoatNode → Gateway: Heartbeat

- Packet type: `2`
- Source: BoatNode ID (`1` in the current BoatNode configuration)
- Destination: `0xFF` broadcast
- Payload length: `13` bytes
- Total serialized size: `25` bytes

Heartbeat payload:

```text
bytes 0-3   packet ID, uint32 little-endian
bytes 4-7   BoatNode uptime, uint32 little-endian
byte 8      firmware major
byte 9      firmware minor
byte 10     firmware patch
byte 11     battery percentage
byte 12     status
```

The Gateway parser reads the same 32-bit packet ID from payload bytes 0–3 and preserves the 16-bit sequence number from the common header.

## Gateway → BoatNode: HeartbeatAck

- Packet type: `4`
- Source: Gateway ID `0xFE`
- Destination: BoatNode ID
- Payload length: `9` bytes
- Total serialized size: `21` bytes

HeartbeatAck payload:

```text
bytes 0-3   acknowledged heartbeat packet ID, uint32 little-endian
byte 4      target BoatNode ID
bytes 5-8   Gateway receive timestamp, uint32 milliseconds
```

BoatNode accepts an ACK only when all of the following match:

- packet type is `HeartbeatAck`
- payload length is 9
- source is `0xFE`
- destination is the local BoatNode ID
- embedded target ID is the local BoatNode ID
- embedded packet ID matches the active heartbeat

Retries resend the same heartbeat packet structure and packet ID.

## Gateway processing order

```text
receive → parse → validate → HeartbeatAck TX → backend queue
```

The backend is not on the LoRa ACK critical path.

## Gateway → Backend

Endpoint:

```text
POST /api/ingest/gateway
```

The Gateway sends only the supported `HEARTBEAT_RECEIVED` fields:

```json
{
  "eventType": "HEARTBEAT_RECEIVED",
  "nodeId": 1,
  "packetId": 1,
  "destination": 255,
  "sequence": 0,
  "packetSize": 25,
  "receivedAtMs": 123456,
  "rssi": -80,
  "snr": 7.25
}
```

The numeric example above documents the shape only; no example record was inserted into PostgreSQL.

Transport behavior:

- in-memory queue capacity: 8 events
- HTTP timeout: 1500 ms
- maximum attempts: 2
- retry delay: 250 ms
- retry uses the same node ID, packet ID, and sequence
- unavailable transport and exhausted retries are logged as errors
- no fake success is reported

Backend deduplication uses `(eventType, nodeId, packetId)`.

## Software-only verification

`jalri-gateway-firmware/test/run_protocol_contract.sh` compiles and executes the real BoatNode serializer/parser/validator, Gateway parser/validator, and Gateway ACK builder. It verifies heartbeat framing, field widths, CRC rejection, ACK framing, packet ID preservation, source/destination values, and malformed frame rejection.

This test does not emulate RF, radio timing, antenna behavior, or physical delivery.
