import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="telemetry-empty-state">
      <p className="telemetry-empty-title">{title}</p>
      <p className="telemetry-empty-message">{message}</p>
    </div>
  );
}

export function TelemetryOverview() {
  return (
    <div className="telemetry-page">
      <header className="telemetry-header">
        <h1>Telemetry</h1>
        <p>Technical telemetry received from Jalri devices.</p>
      </header>

      <section className="telemetry-device-section" aria-label="Device selection">
        <div className="telemetry-device-header">
          <label htmlFor="telemetry-device">Device</label>
          <StatusBadge label="Unavailable" />
        </div>
        <select id="telemetry-device" disabled defaultValue="none">
          <option value="none">No devices available</option>
        </select>
      </section>

      <section className="telemetry-overview-section" aria-label="Telemetry overview">
        <SectionHeader title="Telemetry Overview" />
        <Card className="telemetry-overview-panel">
          <EmptyState
            title="Telemetry data unavailable"
            message="No telemetry records are currently available."
          />
        </Card>
      </section>

      <section className="telemetry-data-section" aria-label="Technical data">
        <SectionHeader title="Technical Data" description="Detailed telemetry will appear here when available." />
        <DataTable>
          <div className="telemetry-table-empty">
            <p className="telemetry-empty-title">No technical data</p>
            <p className="telemetry-empty-message">Telemetry fields are not defined or available yet.</p>
          </div>
        </DataTable>
      </section>

      <section className="telemetry-history-section" aria-label="Telemetry history">
        <SectionHeader title="Telemetry History" />
        <Card className="telemetry-history-panel">
          <EmptyState
            title="Telemetry history unavailable"
            message="Historical telemetry will appear here when data is available."
          />
        </Card>
      </section>
    </div>
  );
}

