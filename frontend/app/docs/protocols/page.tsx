import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { DocsDiagram } from "@/components/docs/DocsDiagram";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

export default function ProtocolsDocPage() {
  const pagination = getDocPagination("/docs/protocols");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 11</div>
        <h1 className="docs-page-title">Protocols & Interfaces</h1>
        <p className="docs-page-lead">
          Formal data contracts, wire serialization schemas, BLE GATT definitions, and HTTP JSON specifications across all inter-tier interfaces.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="Firmware v3 Binary Wire Spec & Backend Ingestion JSON Schema Formally Documented"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">1. BoatNode ↔ Gateway LoRa Protocol (v3)</h2>
        <p className="docs-p">
          Both BoatNode and Gateway firmware adhere to the exact 10-byte header binary layout:
        </p>
        <DocsCodeBlock
          language="text"
          filename="Wire Specification (Protocol v3)"
          code={`byte 0      preamble         0xA5
byte 1      protocol         0x03
byte 2      packet type      (1=DATA, 2=HEARTBEAT, 3=DATA_ACK, 4=HEARTBEAT_ACK)
byte 3      source ID        uint8 (1..254)
byte 4      destination ID   uint8 (0xFF=Broadcast, 0xFE=Gateway)
bytes 5-6   sequence         uint16, little-endian
byte 7      TTL              uint8 (Default: 8)
byte 8      hop count        uint8 (Starts: 0)
byte 9      payload length   uint8 (0..48 bytes)
bytes 10..N payload          type-specific bytes
last 2 B    CRC-16/CCITT     uint16, little-endian (polynomial 0x1021, init 0xFFFF)`}
        />
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">2. Gateway → Backend Ingestion Contract</h2>
        <p className="docs-p">
          Delivered over HTTP POST to <code>/api/ingest/gateway</code>:
        </p>
        <DocsCodeBlock
          language="json"
          filename="Gateway Ingestion JSON Payload"
          code={`{
  "eventType": "HEARTBEAT_RECEIVED",
  "nodeId": 1,
  "packetId": 1024,
  "destination": 255,
  "sequence": 12,
  "packetSize": 25,
  "receivedAtMs": 284092,
  "rssi": -82,
  "snr": 6.75
}`}
        />
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Field</th>
                <th>Type</th>
                <th>Required</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr><td><code>eventType</code></td><td>string</td><td>Yes</td><td>Must be literal <code>"HEARTBEAT_RECEIVED"</code></td></tr>
              <tr><td><code>nodeId</code></td><td>integer</td><td>Yes</td><td>Source vessel node ID (must match a registered boat)</td></tr>
              <tr><td><code>packetId</code></td><td>uint32</td><td>Yes</td><td>32-bit packet ID from heartbeat payload for dedup</td></tr>
              <tr><td><code>destination</code></td><td>integer</td><td>Yes</td><td>Packet destination ID (typically 255)</td></tr>
              <tr><td><code>sequence</code></td><td>integer</td><td>Yes</td><td>16-bit sequence number from header</td></tr>
              <tr><td><code>packetSize</code></td><td>integer</td><td>Yes</td><td>Total received packet size in bytes (25 for heartbeat)</td></tr>
              <tr><td><code>receivedAtMs</code></td><td>uint32</td><td>Yes</td><td>Gateway millisecond uptime at receipt</td></tr>
              <tr><td><code>rssi</code></td><td>integer</td><td>No</td><td>Received Signal Strength Indication (dBm)</td></tr>
              <tr><td><code>snr</code></td><td>float</td><td>No</td><td>Signal-to-Noise Ratio (dB)</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">3. Android ↔ BoatNode BLE Interface</h2>
        <p className="docs-p">
          Custom BLE GATT service exposed by the BoatNode for local phone communication:
        </p>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Characteristic UUID</th>
                <th>Properties</th>
                <th>Payload Content</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>00002A01-...-TX</code></td>
                <td>Write / Write Without Response</td>
                <td>Compact message framing from Android outbox (SOS trigger, text intent)</td>
              </tr>
              <tr>
                <td><code>00002A02-...-RX</code></td>
                <td>Notify / Indicate</td>
                <td>BoatNode ACK notifications, link status (QUEUED, SENT, DELIVERED)</td>
              </tr>
              <tr>
                <td><code>00002A03-...-STATUS</code></td>
                <td>Read / Notify</td>
                <td>Radio link health, active neighbors count, battery percentage</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">4. Backend REST Response Contracts</h2>
        <DocsCodeBlock
          language="typescript"
          filename="TypeScript Data Contracts (lib/api.ts)"
          code={`export interface BoatResponse {
  id: string;
  boatId: string;
  nodeId: number;
  name: string;
  status: "ACTIVE" | "INACTIVE" | "EMERGENCY";
  lastSeen: string | null;
  heartbeatCount: number;
  lastRssi: number | null;
  lastSnr: number | null;
}

export interface AlertResponse {
  id: string;
  boatId: string;
  type: "SOS" | "GEOFENCE" | "LOW_BATTERY" | "COLLISION_RISK";
  status: "ACTIVE" | "ACKNOWLEDGED" | "RESOLVED";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  message: string;
  createdAt: string;
  resolvedAt: string | null;
}

export interface TelemetryResponse {
  id: string;
  boatId: string;
  timestamp: string;
  latitude: number | null;
  longitude: number | null;
  speed: number | null;
  heading: number | null;
  batteryPercentage: number | null;
  rssi: number | null;
  snr: number | null;
}`}
        />
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
