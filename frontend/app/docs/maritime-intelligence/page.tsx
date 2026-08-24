import { DocsStatusBadge } from "@/components/docs/DocsStatusBadge";
import { DocsNavPagination } from "@/components/docs/DocsNavPagination";
import { getDocPagination } from "@/lib/docs-data";

export default function MaritimeIntelligenceDocPage() {
  const pagination = getDocPagination("/docs/maritime-intelligence");

  return (
    <article>
      <header className="docs-page-header">
        <div className="docs-page-num-tag">SECTION 08</div>
        <h1 className="docs-page-title">Maritime Intelligence</h1>
        <p className="docs-page-lead">
          Planned analytical and geospatial intelligence capabilities for coastal border awareness, drift prediction, and maritime risk assessment.
        </p>
        <DocsStatusBadge
          status="PLANNED"
          detail="System Concepts Formulated; Implementation Staged Post-Telemetry Density"
        />
      </header>

      <section className="docs-section">
        <h2 className="docs-h2">Overview</h2>
        <p className="docs-p">
          Maritime Intelligence represents the higher-level analytical layer planned for the Jalari cloud backend and edge processors. Once reliable telemetry data is continuously aggregated from vessel fleets, automated geospatial algorithms will provide real-time hazard detection and predictive safety guidance.
        </p>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Planned Intelligence Modules</h2>
        <div className="docs-grid-2">
          <div className="docs-card-panel">
            <span className="docs-card-tag" style={{ background: "#fdf3e2", color: "#8c5b16" }}>Geospatial</span>
            <h4>Geofencing & Border Warning</h4>
            <p>Monitors vessel proximity to International Maritime Boundary Lines (IMBL), restricted military zones, and marine sanctuaries. Dispatches proximity alerts before accidental border crossings occur.</p>
          </div>
          <div className="docs-card-panel">
            <span className="docs-card-tag" style={{ background: "#e2f0f7", color: "#1e5979" }}>Oceanographic</span>
            <h4>Ocean Current Drift Modeling</h4>
            <p>Calculates probable drift vectors for disabled or silent craft based on local tidal patterns, wind velocity, and last-known GPS coordinates to assist Search-and-Rescue (SAR) teams.</p>
          </div>
          <div className="docs-card-panel">
            <span className="docs-card-tag" style={{ background: "#e4efe7", color: "#275939" }}>Safety Index</span>
            <h4>Dynamic Vessel Risk Scoring</h4>
            <p>Computes a composite safety risk metric incorporating distance from shore, sea state forecasts, radio link margin (RSSI/SNR), and vessel battery health.</p>
          </div>
          <div className="docs-card-panel">
            <span className="docs-card-tag" style={{ background: "#fbeae9", color: "#922b25" }}>Navigation</span>
            <h4>Safe Corridor Navigation</h4>
            <p>Identifies safe coastal navigation routes avoiding shallow reefs, seasonal submerged sandbars, and heavy commercial shipping lanes.</p>
          </div>
        </div>
      </section>

      <section className="docs-section">
        <h2 className="docs-h2">Implementation Boundary</h2>
        <div className="docs-callout docs-callout-info">
          <div className="docs-callout-title">Development Roadmap</div>
          <div className="docs-callout-body">
            These features are planned for future backend and edge releases. They will be implemented once high-density live telemetry feeds from multi-node field deployments are active and calibrated against regional maritime GIS databases.
          </div>
        </div>
      </section>

      <DocsNavPagination prev={pagination.prev} next={pagination.next} />
    </article>
  );
}
