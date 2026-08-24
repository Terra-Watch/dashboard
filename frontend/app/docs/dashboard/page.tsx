import Link from "next/link";
import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

export default function DashboardDocPage() {
  const pagination = getDocPagination("/docs/dashboard");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 10</div>
        <h1 className="docs-page-title">Operations Dashboard</h1>
        <p className="docs-page-lead">
          Architecture, navigational structure, component layout, and user experience design for the Jalari shore station operations workspace.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="Next.js 15 Operations Dashboard with 8 Core Views Fully Implemented"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Dashboard Overview</h2>
        <p className="docs-p">
          The Jalari Operations Dashboard provides shore operators, harbor authorities, and rescue coordinators with an integrated situational awareness workspace. Built with modern Next.js 15 and server-rendered components, it displays real-time vessel telemetry, handles emergency distress escalations, and audits historical system events.
        </p>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Dashboard Route Breakdown</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Route</th>
                <th>View Name</th>
                <th>Core Functionality</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>/dashboard</code></td>
                <td><strong>Overview</strong></td>
                <td>Fleet status summary cards, active vessel counts, recent alerts, and quick-action shortcuts</td>
              </tr>
              <tr>
                <td><code>/dashboard/boats</code></td>
                <td><strong>Vessel Registry</strong></td>
                <td>Filterable list of registered craft, node IDs, registration metadata, and battery states</td>
              </tr>
              <tr>
                <td><code>/dashboard/map</code></td>
                <td><strong>Live Maritime Map</strong></td>
                <td>Leaflet.js geospatial map plotting last-known vessel coordinates and RF coverage zones</td>
              </tr>
              <tr>
                <td><code>/dashboard/alerts</code></td>
                <td><strong>Alerts & SOS</strong></td>
                <td>Incident management queue for SOS beacons, geofence breaches, with Acknowledge/Resolve workflows</td>
              </tr>
              <tr>
                <td><code>/dashboard/telemetry</code></td>
                <td><strong>Telemetry</strong></td>
                <td>Vessel battery level, RF signal strength (RSSI/SNR), packet counts, and transmission latency</td>
              </tr>
              <tr>
                <td><code>/dashboard/history</code></td>
                <td><strong>Operational History</strong></td>
                <td>Filterable chronological audit log of all heartbeat receipts, alerts, and system state changes</td>
              </tr>
              <tr>
                <td><code>/dashboard/gateway</code></td>
                <td><strong>Shore Gateways</strong></td>
                <td>Gateway station health, Wi-Fi backhaul connectivity, and local packet throughput statistics</td>
              </tr>
              <tr>
                <td><code>/dashboard/system-status</code></td>
                <td><strong>System Status</strong></td>
                <td>Subsystem diagnostics across Database, API Server, Gateway Link, and Radio Transceivers</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Neutral Unavailable State Philosophy</h2>
        <div className="docs-callout docs-callout-info">
          <div className="docs-callout-title">Operational Honesty Design Rule</div>
          <div className="docs-callout-body">
            In safety-critical maritime operations, <strong>false certainty is dangerous</strong>. The Jalari dashboard adheres to strict neutral unavailable state patterns:
            <ul className="docs-ul" style={{ margin: "8px 0 0 0", paddingLeft: "18px" }}>
              <li className="docs-li">When physical hardware is disconnected or no vessels are reporting, views display clean, truthful empty states rather than fake randomized mock dots.</li>
              <li className="docs-li">RSSI and SNR metrics are left blank or marked &ldquo;No Signal&rdquo; unless actively parsed from incoming packets.</li>
              <li className="docs-li">Operators can always distinguish between &ldquo;No Active Vessels&rdquo; and &ldquo;Backend Connection Lost&rdquo;.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Design System & Styling Tokens</h2>
        <p className="docs-p">
          The dashboard is styled using a curated maritime color palette defined in <code>globals.css</code>:
        </p>
        <div className="docs-grid-3">
          <div className="docs-card-panel">
            <h4>Maritime Navy</h4>
            <p><code>#29434d</code> (Primary brand, navigation sidebar, and high-emphasis headers)</p>
          </div>
          <div className="docs-card-panel">
            <h4>Coastal Sage</h4>
            <p><code>#557861</code> (Healthy status badges, operational vessels, and successful ACKs)</p>
          </div>
          <div className="docs-card-panel">
            <h4>Warning Amber & Danger</h4>
            <p><code>#a47b3c</code> (Warnings/timeouts) and <code>#a84b45</code> (Critical SOS distress alerts)</p>
          </div>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
