import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsCodeBlock } from "@/components/docs/DocsCodeBlock";
import { DocsDiagram, DocsFlowchart } from "@/components/docs/DocsDiagram";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

const BACKEND_STEPS = [
  {
    title: "HTTP Requests (Shore Gateways / Web Dashboard)",
    subtitle: "Incoming telemetry payloads from gateways, and data polling / query API traffic from dashboards.",
    tech: "IP Backhaul Ingestion Link",
    connectorText: "FastAPI Routing"
  },
  {
    title: "FastAPI Routers (app/api/routes/*.py)",
    subtitle: "Exposes endpoints for boats, gateways, alerts, telemetry, history, and raw packet ingestion.",
    tech: "FastAPI App Engine",
    connectorText: "Clean Validation"
  },
  {
    title: "Service Layer (app/services/*.py)",
    subtitle: "Applies business logic: packet deduplication, check-in timeout triggers, and state transformations.",
    tech: "Python Domain Logic",
    connectorText: "Database Transactions"
  },
  {
    title: "Repository Layer (app/repositories/*.py)",
    subtitle: "Decouples query execution and data access patterns from database ORM dependencies.",
    tech: "Repository Pattern",
    connectorText: "SQLAlchemy Mapper"
  },
  {
    title: "SQLAlchemy Models & PostgreSQL",
    subtitle: "Maps clean domain schemas to SQL relational database tables: boats, alerts, history, and gateways.",
    tech: "PostgreSQL 16 DB Engine"
  }
];

export default function BackendDocPage() {
  const pagination = getDocPagination("/docs/backend");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 09</div>
        <h1 className="docs-page-title">Backend & Database</h1>
        <p className="docs-page-lead">
          Technical specifications for the FastAPI application service layer, PostgreSQL database persistence models, Alembic migrations, and idempotent gateway telemetry ingestion.
        </p>
        <DocsStatusBadge
          status="IMPLEMENTED"
          detail="FastAPI REST API, Ingestion Handlers & SQLAlchemy Repositories Operational"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Technology Stack</h2>
        <div className="docs-grid-3">
          <div className="docs-card-panel">
            <h4>Application Framework</h4>
            <p><strong>FastAPI 0.115+</strong> with Pydantic v2 schemas, asynchronous request handling, and dependency injection.</p>
          </div>
          <div className="docs-card-panel">
            <h4>Database & ORM</h4>
            <p><strong>PostgreSQL 16+</strong> managed via <strong>SQLAlchemy 2.0+</strong> ORM with connection pooling.</p>
          </div>
          <div className="docs-card-panel">
            <h4>Schema Migrations</h4>
            <p><strong>Alembic</strong> managing deterministic, versioned database schema transformations.</p>
          </div>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Layered Service Architecture</h2>
        <DocsDiagram title="Backend Software Architecture" caption="Clean architecture with decoupled Routers, Services, Repositories, and SQLAlchemy Models.">
          <DocsFlowchart nodes={BACKEND_STEPS} />
        </DocsDiagram>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Database Domain Entities</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Entity Model</th>
                <th>Primary Table</th>
                <th>Key Columns & Relationships</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong className="docs-strong">Boat</strong></td>
                <td><code>boats</code></td>
                <td><code>id (UUID)</code>, <code>boatId (string)</code>, <code>nodeId (int)</code>, <code>name</code>, <code>status (ACTIVE/INACTIVE/EMERGENCY)</code>, <code>lastSeen</code>, <code>heartbeatCount</code>, <code>lastRssi</code>, <code>lastSnr</code></td>
              </tr>
              <tr>
                <td><strong className="docs-strong">Gateway</strong></td>
                <td><code>gateways</code></td>
                <td><code>id (UUID)</code>, <code>gatewayId (string)</code>, <code>name</code>, <code>status (ONLINE/OFFLINE)</code>, <code>lastSeen</code>, <code>location</code></td>
              </tr>
              <tr>
                <td><strong className="docs-strong">Telemetry</strong></td>
                <td><code>telemetry</code></td>
                <td><code>id (UUID)</code>, <code>boat_id (FK)</code>, <code>timestamp</code>, <code>latitude</code>, <code>longitude</code>, <code>speed</code>, <code>heading</code>, <code>batteryPercentage</code>, <code>rssi</code>, <code>snr</code></td>
              </tr>
              <tr>
                <td><strong className="docs-strong">Alert</strong></td>
                <td><code>alerts</code></td>
                <td><code>id (UUID)</code>, <code>boat_id (FK)</code>, <code>type (SOS/GEOFENCE/LOW_BATTERY)</code>, <code>status (ACTIVE/ACKNOWLEDGED/RESOLVED)</code>, <code>severity</code>, <code>createdAt</code></td>
              </tr>
              <tr>
                <td><strong className="docs-strong">HistoricalEvent</strong></td>
                <td><code>historical_events</code></td>
                <td><code>id (UUID)</code>, <code>boat_id (FK)</code>, <code>eventType (HEARTBEAT_RECEIVED/...)</code>, <code>timestamp</code>, <code>details (JSONB)</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Gateway Ingestion & Deduplication Pipeline</h2>
        <p className="docs-p">
          Shore gateways deliver received LoRa frames to the internal ingestion endpoint:
        </p>
        <DocsCodeBlock
          language="http"
          filename="POST /api/ingest/gateway"
          code={`POST /api/ingest/gateway HTTP/1.1
Host: api.jalri.local
Content-Type: application/json

{
  "eventType": "HEARTBEAT_RECEIVED",
  "nodeId": 1,
  "packetId": 1042,
  "destination": 255,
  "sequence": 48,
  "packetSize": 25,
  "receivedAtMs": 482039,
  "rssi": -78,
  "snr": 8.50
}`}
        />

        <h3 className="docs-h3">Idempotency Rule</h3>
        <p className="docs-p">
          Because lossy RF channels can cause a Gateway to re-transmit an event, the <code>IngestionService</code> enforces deduplication using the composite key:
        </p>
        <div className="docs-callout docs-callout-info">
          <div className="docs-callout-title">Deduplication Key</div>
          <div className="docs-callout-body">
            <code>(eventType, nodeId, packetId)</code>
            <br />
            If a matching event has already been recorded in PostgreSQL, the backend acknowledges with <code>HTTP 202 (Duplicate Ignored)</code> without double-incrementing vessel heartbeat metrics or inserting redundant historical records.
          </div>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">REST API Endpoint Directory</h2>
        <div className="docs-table-wrapper">
          <table className="docs-table">
            <thead>
              <tr>
                <th>Method</th>
                <th>Route</th>
                <th>Description</th>
                <th>Success Code</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>GET</code></td>
                <td><code>/health</code></td>
                <td>Service health check</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/boats</code></td>
                <td>List registered vessels (supports <code>search</code> filter)</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/boats/{`{boatId}`}</code></td>
                <td>Retrieve single vessel operational profile</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>POST</code></td>
                <td><code>/api/boats</code></td>
                <td>Register a new vessel / assign node ID</td>
                <td><code>201 Created</code></td>
              </tr>
              <tr>
                <td><code>PATCH</code></td>
                <td><code>/api/boats/{`{boatId}`}</code></td>
                <td>Update vessel metadata / registration status</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/gateways</code></td>
                <td>List registered shore gateway stations</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/telemetry</code></td>
                <td>Query telemetry data (supports <code>boatId</code>, <code>from</code>, <code>to</code>)</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/boats/{`{boatId}`}/telemetry</code></td>
                <td>Query telemetry history for a specific boat</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/alerts</code></td>
                <td>List system alerts (supports <code>status</code> and <code>type</code> filter)</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>POST</code></td>
                <td><code>/api/alerts/{`{alertId}`}/acknowledge</code></td>
                <td>Acknowledge active emergency / warning alert</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>POST</code></td>
                <td><code>/api/alerts/{`{alertId}`}/resolve</code></td>
                <td>Mark alert as resolved</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/history</code></td>
                <td>Audit log of historical operational events</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>GET</code></td>
                <td><code>/api/system-status</code></td>
                <td>Aggregated health status of all system components</td>
                <td><code>200 OK</code></td>
              </tr>
              <tr>
                <td><code>POST</code></td>
                <td><code>/api/ingest/gateway</code></td>
                <td>Gateway LoRa event ingestion endpoint</td>
                <td><code>202 Accepted</code></td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
