import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

export default function ChangelogDocPage() {
  const pagination = getDocPagination("/docs/changelog");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 17</div>
        <h1 className="docs-page-title">Changelog & Technical Roadmap</h1>
        <p className="docs-page-lead">
          Verified version history, implemented feature milestones, and upcoming architectural deliverables.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="Version 0.1.0 Foundation Established"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Release History</h2>

        <div className="docs-card-panel" style={{ marginBottom: "20px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <h4 style={{ margin: 0 }}>Release v0.1.0 (Current Baseline)</h4>
            <span className="docs-version-tag">STABLE FOUNDATION</span>
          </div>
          <p style={{ marginBottom: "12px" }}>
            Initial unified architectural baseline establishing Protocol v3 framing, single-hop LoRa reliability, shore gateway ingestion, and web operations workspace.
          </p>
          <ul className="docs-ul" style={{ margin: 0 }}>
            <li className="docs-li"><strong>BoatNode Firmware:</strong> ESP32-S3 + SX1278 driver, Protocol v3 binary serialization (10-byte header, CCITT CRC-16), periodic heartbeat scheduler (2000 ms), <code>AckManager</code> with bounded transmit queue (8 slots) and 3 retries.</li>
            <li className="docs-li"><strong>Gateway Firmware:</strong> Continuous LoRa packet listener, immediate <code>HeartbeatAck</code> / <code>DataAck</code> generation, <code>DeviceRegistry</code> with 30-second liveness tracking, and asynchronous HTTP ingestion client with RAM queue.</li>
            <li className="docs-li"><strong>Protocol Contract:</strong> Cross-repository host test runner (<code>test/run_protocol_contract.sh</code>) validating parser, serializer, and validator interoperability.</li>
            <li className="docs-li"><strong>Backend & DB:</strong> FastAPI 0.115+ application with SQLAlchemy models (<code>Boat</code>, <code>Gateway</code>, <code>Telemetry</code>, <code>Alert</code>, <code>HistoricalEvent</code>), Alembic migrations, and deduplicated <code>/api/ingest/gateway</code> handler.</li>
            <li className="docs-li"><strong>Operations Dashboard:</strong> Next.js 15 App Router web workspace with 8 core views and strict neutral unavailable state handling.</li>
          </ul>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Forward Roadmap</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Phase</th>
                <th>Target Feature</th>
                <th>Architectural Scope</th>
                <th>Target Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Phase 2.5</strong></td>
                <td>Coastal Field Validation</td>
                <td>Over-the-water line-of-sight RF testing at 2–10 km range with GPS ground truthing</td>
                <td><span className="docs-badge docs-badge-in-progress">NEXT</span></td>
              </tr>
              <tr>
                <td><strong>Phase 3</strong></td>
                <td>Multi-Hop Forwarding</td>
                <td>Replacing <code>NullForwardingStrategy</code> with opportunistic next-hop relay forwarding</td>
                <td><span className="docs-badge docs-badge-planned">PLANNED</span></td>
              </tr>
              <tr>
                <td><strong>Phase 4</strong></td>
                <td>Store-and-Forward DTN</td>
                <td>Non-volatile flash-backed queueing for out-of-range vessel packet storage</td>
                <td><span className="docs-badge docs-badge-planned">PLANNED</span></td>
              </tr>
              <tr>
                <td><strong>Phase 5</strong></td>
                <td>Scored Routing Intelligence</td>
                <td>Routing decisions weighted by rolling EWMA RSSI/SNR and battery energy metrics</td>
                <td><span className="docs-badge docs-badge-planned">PLANNED</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
