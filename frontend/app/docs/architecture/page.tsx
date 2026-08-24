import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsDiagram, DocsFlowchart } from "@/components/docs/DocsDiagram";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

const SYSTEM_TOPOLOGY_NODES = [
  {
    title: "Fisherman / Crew",
    subtitle: "Originates emergency SOS beacons, regular check-in checkouts, or speech-to-text messages on the vessel.",
    tech: "User Distress Action",
    connectorText: "Bluetooth BLE GATT"
  },
  {
    title: "Android Companion App",
    subtitle: "Durable offline MVVM storage (Room DB), speech inference model, offline map tiles, and outbox synchronization queue.",
    tech: "Room DB & MapLibre",
    connectorText: "BLE Synchronization Link"
  },
  {
    title: "BoatNode Vessel Unit",
    subtitle: "ESP32-S3 microcontroller, SX1278 physical layer transceiver, Protocol v3 binary framer, AckManager with retries, and local sensors.",
    tech: "ESP32-S3 Firmware",
    connectorText: "LoRa Sub-GHz Physical Link (433 MHz)"
  },
  {
    title: "LoRa Mesh Network (Future)",
    subtitle: "Relay nodes dynamically forward packets to bypass line-of-sight maritime blockages, extending operational search ranges.",
    tech: "Ad-hoc Relaying",
    connectorText: "Forwarded LoRa Frame"
  },
  {
    title: "Shore Gateway Station (0xFE)",
    subtitle: "Performs continuous packet scanning, transmits immediate HeartbeatAck/DataAck, runs local node registry, and queues JSON posts.",
    tech: "Immediate RF ACK & Ingest Q",
    connectorText: "HTTP POST /api/ingest/gateway"
  },
  {
    title: "FastAPI Backend Core",
    subtitle: "Deduplicates events by eventType, nodeId, and packetId; checks node registration; exposes REST APIs; manages Alembic database states.",
    tech: "SQLAlchemy & Alembic",
    connectorText: "REST Data Contracts"
  },
  {
    title: "Operations Dashboard Workspace",
    subtitle: "Real-time Leaflet tracking map, SOS incident control, detailed historical logging, and system metrics with offline fallback views.",
    tech: "Next.js 15 App Router"
  }
];

export default function ArchitectureDocPage() {
  const pagination = getDocPagination("/docs/architecture");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 02</div>
        <h1 className="docs-page-title">System Architecture</h1>
        <p className="docs-page-lead">
          Detailed architectural breakdown of the Jalari ecosystem, detailing multi-tiered component boundaries, data pathways, and fail-safe offline guarantees.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="Decoupled Tier Architecture & Communication Boundaries Verified"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Architectural Principles</h2>
        <p className="docs-p">
          Jalari is designed around strict separation of concerns, defensive communication boundaries, and zero reliance on synchronous internet connections along the vessel-side chain:
        </p>
        <ul className="docs-ul">
          <li className="docs-li">
            <strong className="docs-strong">Strict Local Delivery First:</strong> Every action initiated on the vessel (distress alerts, telemetry, chat messages) is durably committed to local non-volatile storage before any over-the-air transmission is attempted.
          </li>
          <li className="docs-li">
            <strong className="docs-strong">Decoupled Processing Stages:</strong> The Gateway responds with RF LoRa ACKs immediately upon packet validation. Backend HTTP ingestion runs asynchronously through a bounded queue to prevent radio pipeline stall.
          </li>
          <li className="docs-li">
            <strong className="docs-strong">Hardware Abstraction (HAL):</strong> Microcontroller firmware isolates platform-specific Arduino/ESP32 APIs behind pure C++ interfaces, enabling deterministic host unit testing without physical silicon.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Complete End-to-End System Flow</h2>
        <DocsDiagram title="End-to-End Tier Interaction Diagram" caption="Interactive flowchart showing data progression across BLE, LoRa, HTTP backhaul, and REST/Web dashboard interfaces.">
          <DocsFlowchart nodes={SYSTEM_TOPOLOGY_NODES} />
        </DocsDiagram>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Component Responsibilities Matrix</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Tier / Component</th>
                <th>Core Responsibilities</th>
                <th>Explicit Non-Responsibilities</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Android Companion App</strong></td>
                <td>
                  • User interface & local state management<br />
                  • Speech-to-Text inference (voice messages)<br />
                  • GPS coordinate acquisition<br />
                  • Offline map tile cache (Room/SQLite storage)<br />
                  • Draining outbox to BoatNode via BLE
                </td>
                <td>
                  • Never speaks LoRa directly<br />
                  • Never manages network routing<br />
                  • Never drops un-ACKed SOS without operator override
                </td>
              </tr>
              <tr>
                <td><strong>BoatNode Firmware</strong></td>
                <td>
                  • LoRa Protocol v3 framing & serialization<br />
                  • Periodic Heartbeat generation (2000 ms default)<br />
                  • Reliable unicast transmit queue (8 slots)<br />
                  • Hop-by-hop ACK tracking & retry (3 attempts)<br />
                  • Neighbor beacon observation & RSSI/SNR metrics
                </td>
                <td>
                  • No speech processing or audio storage<br />
                  • No high-level map rendering<br />
                  • No persistent multi-month message archives
                </td>
              </tr>
              <tr>
                <td><strong>Shore Gateway Firmware</strong></td>
                <td>
                  • Continuous LoRa packet reception & CRC validation<br />
                  • Immediate HeartbeatAck / DataAck transmission<br />
                  • Deduplication of retransmitted frames<br />
                  • Local node liveness registry (30s timeout)<br />
                  • Buffering & HTTP POST forwarding to Backend
                </td>
                <td>
                  • Does not wait for backend response before sending LoRa ACK<br />
                  • Does not alter boat database records directly<br />
                  • Does not run UI or web servers
                </td>
              </tr>
              <tr>
                <td><strong>FastAPI Backend</strong></td>
                <td>
                  • Validating JSON gateway ingestion payloads<br />
                  • Idempotent deduplication by <code>(eventType, nodeId, packetId)</code><br />
                  • Updating Boat operational state & historical event logs<br />
                  • Exposing standard REST endpoints for Dashboard consumers
                </td>
                <td>
                  • Does not interact with raw LoRa hardware<br />
                  • Does not assume Gateway sends UTC timestamps
                </td>
              </tr>
              <tr>
                <td><strong>Operations Dashboard</strong></td>
                <td>
                  • Visualizing fleet positions and operational status<br />
                  • Incident triage for active SOS & critical alerts<br />
                  • Telemetry and historical event audit logging<br />
                  • Gracefully rendering neutral unavailable states when offline
                </td>
                <td>
                  • Never displays fabricated or simulated live vessel telemetry<br />
                  • Does not send direct raw radio commands
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Critical Path Boundary Isolation</h2>
        <div className="docs-callout docs-callout-info">
          <div className="docs-callout-title">The Radio ACK Boundary</div>
          <div className="docs-callout-body">
            A fundamental design decision in Jalari is that <strong>the backend is never on the LoRa ACK critical path</strong>. When the Gateway receives a valid packet from a BoatNode, it transmits the RF acknowledgement immediately (within milliseconds). It then places the parsed event onto an internal 8-slot HTTP ingestion queue. This guarantees that temporary backend latency or shore internet hiccups do not cause the BoatNode to needlessly retransmit over congested LoRa spectrum.
          </div>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
