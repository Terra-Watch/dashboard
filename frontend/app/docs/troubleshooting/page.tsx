import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

export default function TroubleshootingDocPage() {
  const pagination = getDocPagination("/docs/troubleshooting");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 15</div>
        <h1 className="docs-page-title">Troubleshooting & Diagnostics</h1>
        <p className="docs-page-lead">
          Field and laboratory diagnostic guide for resolving hardware wiring errors, firmware build faults, database connection drops, and network anomalies.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="Field & Lab Failure Modes Documented with Recovery Procedures"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">1. Hardware & Radio Transceiver Issues</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Symptom</th>
                <th>Probable Root Cause</th>
                <th>Resolution Procedure</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>LoRa init failed (-1)</code></td>
                <td>SPI bus pinout mismatch or loose breadboard wire</td>
                <td>Verify SPI wiring: SCK=12, MISO=13, MOSI=11, NSS=10, RST=9, DIO0=14. Check 3.3V power rail stability.</td>
              </tr>
              <tr>
                <td>Serial Monitor displays unreadable characters</td>
                <td>Serial baud rate mismatch</td>
                <td>Configure terminal monitor to <code>115200 baud</code> in <code>platformio.ini</code> (<code>monitor_speed = 115200</code>).</td>
              </tr>
              <tr>
                <td>BoatNode transmits but Gateway never logs packet</td>
                <td>Frequency or sync word discrepancy</td>
                <td>Ensure both firmware images compile with <code>433.0 MHz</code> and sync word <code>0x12</code>. Check antenna SMA connection.</td>
              </tr>
              <tr>
                <td>High packet error rate / CRC failures</td>
                <td>Insufficient ground plane or RF interference</td>
                <td>Connect antenna with solid ground plane; ensure transceiver is separated from noisy switching DC-DC converters.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">2. Backend & Ingestion Errors</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Error Code / Log</th>
                <th>Root Cause</th>
                <th>Resolution Procedure</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>422 UnregisteredNodeError</code></td>
                <td>Gateway ingested packet from a node ID not registered in database</td>
                <td>Register the vessel via <code>POST /api/boats</code> with matching <code>nodeId</code> before deploying the BoatNode hardware.</td>
              </tr>
              <tr>
                <td><code>503 Database unavailable</code></td>
                <td>PostgreSQL service down or bad connection string</td>
                <td>Verify PostgreSQL daemon is active (<code>pg_isready</code>) and check <code>DATABASE_URL</code> credentials in <code>website/backend/.env</code>.</td>
              </tr>
              <tr>
                <td>Gateway reports HTTP connection timeout</td>
                <td>Gateway cannot reach backend IP over local Wi-Fi</td>
                <td>Check <code>baseUrl</code> in <code>include/BuildConfig.h</code>. Ensure server firewall allows inbound connections on port 8000.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">3. Frontend & Dashboard Diagnostics</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Symptom</th>
                <th>Explanation</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Dashboard displays &ldquo;No vessels active&rdquo;</td>
                <td>Normal neutral unavailable state. No live heartbeats have arrived within the last timeout window.</td>
              </tr>
              <tr>
                <td>Map displays global view without markers</td>
                <td>Vessels in database do not currently have reported GPS coordinates. Markers appear once coordinates are ingested.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
