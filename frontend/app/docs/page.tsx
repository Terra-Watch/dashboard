import Link from "next/link";
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

export default function OverviewDocPage() {
  const pagination = getDocPagination("/docs");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 01</div>
        <h1 className="docs-page-title">System Overview</h1>
        <p className="docs-page-lead">
          Jalari is an offline-first, long-range maritime safety and telemetry communication system engineered for coastal fishing vessels operating beyond terrestrial cellular coverage.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="Core System Architecture Defined & Multi-Component Foundation Operational"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">What is Jalari?</h2>
        <p className="docs-p">
          Jalari bridges the critical communications gap between small artisanal fishing craft at sea and shore-side operations centers. Traditional maritime safety systems (e.g., AIS Class A/B, satellite EPIRBs) are cost-prohibitive, power-hungry, and rarely adopted by small-scale coastal fishermen. Consequently, when emergencies such as engine failure, capsizing, medical distress, or severe weather occur 5 to 25 km offshore, vessels are rendered entirely invisible and unreachable.
        </p>
        <p className="docs-p">
          Jalari provides an open, resilient, multi-tiered infrastructure pairing commodity microcontrollers (<strong className="docs-strong">ESP32-S3</strong>) and sub-GHz <strong className="docs-strong">LoRa</strong> transceivers (<strong className="docs-strong">SX1278 / SX1262</strong>) with an offline-first Android application, an edge Shore Gateway, a high-performance FastAPI ingestion backend, and a real-time operations dashboard.
        </p>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">The Core Problem</h2>
        <div className="docs-grid-3">
          <div className="docs-card-panel">
            <span className="docs-card-tag" style={{ background: "#fbeae9", color: "#922b25" }}>Connectivity Void</span>
            <h4>Zero Offshore Cellular</h4>
            <p>Cellular coverage decays precipitously beyond 3–8 km offshore. Fishermen spend 90% of their operational hours in complete radio isolation.</p>
          </div>
          <div className="docs-card-panel">
            <span className="docs-card-tag" style={{ background: "#fdf3e2", color: "#8c5b16" }}>Cost Barriers</span>
            <h4>Satellite Unaffordability</h4>
            <p>Commercial satellite terminals and recurring subscriptions are commercially inaccessible for artisanal small-craft operators.</p>
          </div>
          <div className="docs-card-panel">
            <span className="docs-card-tag" style={{ background: "#e2f0f7", color: "#1e5979" }}>Safety Urgency</span>
            <h4>Delayed Rescue Dispatch</h4>
            <p>Without automated distress telemetry, search-and-rescue operations face massive search grids, delaying intervention during the golden hour.</p>
          </div>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">System Objectives</h2>
        <ul className="docs-ul">
          <li className="docs-li">
            <strong className="docs-strong">Offline-First Operational Guarantee:</strong> Emergency distress (SOS) and essential telemetry transmission must never depend on active internet access at sea.
          </li>
          <li className="docs-li">
            <strong className="docs-strong">Low-Power, Autonomous Vessel Nodes:</strong> BoatNode hardware must operate efficiently on small 12V vessel batteries or standalone solar power.
          </li>
          <li className="docs-li">
            <strong className="docs-strong">Deterministic Reliability:</strong> Hop-by-hop acknowledgements, bounded retries, and strict deduplication ensure high Packet Delivery Ratios (PDR) over lossy maritime RF channels.
          </li>
          <li className="docs-li">
            <strong className="docs-strong">Open Protocol Architecture:</strong> Compact binary framing with extensible network headers supporting evolutionary upgrades from single-hop to dynamic multi-hop mesh.
          </li>
        </ul>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">High-Level Architecture</h2>
        <DocsDiagram title="End-to-End System Topology" caption="High-level architecture flowchart spanning vessel, radio network, edge gateway, backend ingestion, and operations dashboard.">
          <DocsFlowchart nodes={SYSTEM_TOPOLOGY_NODES} />
        </DocsDiagram>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Networking Progression Status</h2>
        <p className="docs-p">
          Jalari follows an evidence-driven, 7-phase networking roadmap. In accordance with strict engineering integrity, only features fully verified in the active codebase are documented as completed.
        </p>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Phase</th>
                <th>Focus Area</th>
                <th>Key Mechanisms</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>PHASE 1</strong></td>
                <td>Single-hop Link</td>
                <td>BoatNode ↔ Gateway LoRa link, periodic heartbeat transmission, binary serialization</td>
                <td><span className="docs-badge docs-badge-implemented">DONE</span></td>
              </tr>
              <tr>
                <td><strong>PHASE 2</strong></td>
                <td>Reliable Packet Exchange</td>
                <td>Hop-by-hop ACK, timeout management, retry queue, duplicate detection (packet ID dedup)</td>
                <td><span className="docs-badge docs-badge-in-progress">REFINEMENT</span></td>
              </tr>
              <tr>
                <td><strong>PHASE 3</strong></td>
                <td>Multi-hop Mesh</td>
                <td>BoatNode → Relay BoatNode → Gateway forwarding infrastructure</td>
                <td><span className="docs-badge docs-badge-pending">NEXT</span></td>
              </tr>
              <tr>
                <td><strong>PHASE 4</strong></td>
                <td>Forwarding & DTN</td>
                <td>TTL decrement, hop count limit, store-and-forward queueing, forwarding deduplication</td>
                <td><span className="docs-badge docs-badge-planned">PLANNED</span></td>
              </tr>
              <tr>
                <td><strong>PHASE 5</strong></td>
                <td>Scored Routing</td>
                <td>Neighbor discovery table, EWMA link quality (RSSI/SNR), congestion & energy awareness</td>
                <td><span className="docs-badge docs-badge-planned">PLANNED</span></td>
              </tr>
              <tr>
                <td><strong>PHASE 6</strong></td>
                <td>Advanced Intelligence</td>
                <td>IGPS (Intelligent Geographic Predictive Selection), predictive routing</td>
                <td><span className="docs-badge docs-badge-planned">PLANNED</span></td>
              </tr>
              <tr>
                <td><strong>PHASE 7</strong></td>
                <td>Mesh Stress Testing</td>
                <td>Packet loss injection, node disappearance, route flap recovery, multi-node congestion</td>
                <td><span className="docs-badge docs-badge-not-implemented">FUTURE</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Repository Ecosystem</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Repository / Module</th>
                <th>Technology</th>
                <th>Core Responsibility</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong className="docs-strong">jalari-node-firmware</strong></td>
                <td>C++17, PlatformIO, ESP32-S3</td>
                <td>Vessel BoatNode firmware: protocol v3 serialization, heartbeat, reliable unicast link</td>
              </tr>
              <tr>
                <td><strong className="docs-strong">jalri-gateway-firmware</strong></td>
                <td>C++17, PlatformIO, ESP32-S3</td>
                <td>Shore Gateway: LoRa packet listener, immediate ACK responder, HTTP backend ingestion</td>
              </tr>
              <tr>
                <td><strong className="docs-strong">website/backend</strong></td>
                <td>FastAPI, Python 3.11, PostgreSQL</td>
                <td>REST API, Alembic migrations, idempotent gateway telemetry & heartbeat ingestion</td>
              </tr>
              <tr>
                <td><strong className="docs-strong">website/frontend</strong></td>
                <td>Next.js 15, React 19, TypeScript</td>
                <td>Operations dashboard with fleet monitoring, real-time map, alert handling, telemetry</td>
              </tr>
              <tr>
                <td><strong className="docs-strong">jalari-ai</strong></td>
                <td>Python, Jupyter</td>
                <td>Research repository for edge AI/TinyML (WristNode IMU fall/distress detection)</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
