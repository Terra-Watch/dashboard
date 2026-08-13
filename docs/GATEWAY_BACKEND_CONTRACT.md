# Gateway → Backend Contract

**Status:** Ingestion foundation only  
**Source:** Current `jalri-gateway-firmware` source inspection  
**Transport status:** Gateway HTTP transport implemented; deployment configuration and physical network availability are still required.

## Current boundary

The Gateway firmware receives LoRa packets, processes them locally, and has a configuration-driven HTTP transport for this endpoint. It does not contain a deployment URL or credentials; those remain build configuration values.

```text
BoatNode → LoRa → Gateway RX/parser/validator → bounded HTTP queue → Backend
```

The Gateway continues to generate the real-time LoRa HeartbeatAck independently. Backend ingestion is not involved in that ACK path.

## Gateway transport behavior

- Wi-Fi uses the ESP32 Arduino Wi-Fi client and HTTP client already supplied by the firmware platform.
- The Gateway queues up to 8 heartbeat events in RAM.
- HTTP connect/read timeout is 1500 ms.
- Each queued event is attempted at most twice, with a 250 ms retry delay.
- A failed event is logged and dropped after bounded retries; it is never reported as successful.
- Retries resend the original `nodeId`, `packetId`, and `sequence` values.
- The Gateway ACK is transmitted before the heartbeat is placed on the backend queue.
- `gatewayId` is used for Gateway logging only and is not sent because it is not part of the current backend schema.

## Firmware-derived event

### HEARTBEAT_RECEIVED

**Source:** Gateway `Sx1278LoRaDriver::receive()` and `GatewayService::handleReceivedPacket()`  
**Supported:** Yes, as a local Gateway processing result  
**Backend endpoint event type:** `HEARTBEAT_RECEIVED`

| Field | Required | Type/unit | Meaning |
|---|---:|---|---|
| `eventType` | Yes | Literal string | `HEARTBEAT_RECEIVED`. |
| `nodeId` | Yes | Integer | Parsed heartbeat source node ID. |
| `packetId` | Yes | 32-bit integer | Parsed heartbeat packet ID from the heartbeat payload. |
| `destination` | Yes | Integer | Parsed packet destination ID. |
| `sequence` | Yes | Integer | Parsed packet sequence number. |
| `packetSize` | Yes | Integer, bytes | Received LoRa packet length. |
| `receivedAtMs` | Yes | Integer, milliseconds | Gateway uptime-style receive time from the current firmware. It is not an absolute UTC timestamp. |
| `rssi` | No | Integer, dBm | LoRa packet RSSI when available. |
| `snr` | No | Numeric, dB | LoRa packet SNR when available. |

The backend derives its own UTC receipt time when processing the event because the current Gateway provides no absolute timestamp.

## Not provided by current Gateway firmware

The following are **NOT PROVIDED BY GATEWAY** for the current backend boundary:

- `gatewayId`
- Gateway authentication identity
- Absolute UTC event timestamp
- HTTP/MQTT transport envelope
- Telemetry event transport
- Alert event transport
- SOS event transport
- RTT measurement
- Battery value in the Gateway event
- Latitude/longitude in the Gateway event
- Firmware version in the Gateway event

The firmware packet protocol contains other packet concepts, but the current Gateway service only dispatches supported heartbeat processing to its registry/ACK path. This ingestion foundation does not claim those other event types are available from the Gateway transport.

## Heartbeat processing

For a valid `HEARTBEAT_RECEIVED` event:

1. Validate the request schema and heartbeat packet type.
2. Find the registered Boat by `nodeId`.
3. If no Boat is registered, return `UNREGISTERED_NODE` and do not create a Boat or `boatId`.
4. Update `lastSeen` using backend UTC receipt time.
5. Increment `heartbeatCount` once.
6. Update RSSI/SNR only when supplied.
7. Record one `HEARTBEAT_RECEIVED` historical event.

The Gateway’s LoRa HeartbeatAck is independent and must already have been sent by the Gateway before or alongside future transport delivery.

## Idempotency

For heartbeat ingestion, the deduplication key is:

```text
(eventType, nodeId, packetId)
```

The current historical-events schema has no dedicated idempotency column or unique constraint. The ingestion service checks existing `HEARTBEAT_RECEIVED` event details for this key before updating the Boat or creating a history record. A later schema revision may add a dedicated constraint after review.

## Unsupported events

`TELEMETRY_RECEIVED`, `ALERT`, and `SOS` are rejected by this endpoint because the current Gateway transport does not provide those events. No fake or inferred payload is accepted.
