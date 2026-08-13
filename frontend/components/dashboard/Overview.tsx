import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="overview-empty-state">
      <p className="overview-empty-title">{title}</p>
      <p className="overview-empty-message">{message}</p>
    </div>
  );
}

function Metric({ label, supportingText }: { label: string; supportingText: string }) {
  return (
    <Card className="overview-metric">
      <p className="overview-metric-label">{label}</p>
      <p className="overview-metric-value" aria-label={`${label}: not available`}>
        —
      </p>
      <p className="overview-metric-supporting">{supportingText}</p>
    </Card>
  );
}

export function Overview() {
  return (
    <div className="overview-page">
      <header className="overview-header">
        <h1>Fleet Overview</h1>
        <p>Current operational status of registered vessels.</p>
      </header>

      <section className="overview-section" aria-labelledby="fleet-summary-title">
        <h2 id="fleet-summary-title" className="sr-only">Fleet summary</h2>
        <div className="overview-metrics">
          <Metric label="TOTAL VESSELS" supportingText="No registered vessel data" />
          <Metric label="ONLINE" supportingText="No connection data" />
          <Metric label="ACTIVE ALERTS" supportingText="No alert data" />
        </div>
      </section>

      <section className="overview-workspace" aria-label="Main operational workspace">
        <Card className="overview-position-panel">
          <SectionHeader title="Fleet Position" />
          <EmptyState
            title="No vessel positions available"
            message="Location telemetry will appear here when available."
          />
        </Card>

        <div className="overview-side-column">
          <Card className="overview-side-panel overview-alerts-panel">
            <SectionHeader title="Active Alerts" />
            <EmptyState title="No active alerts" message="System is currently clear." />
          </Card>

          <Card className="overview-side-panel">
            <SectionHeader title="Recent Activity" />
            <EmptyState title="No recent activity." message="" />
          </Card>
        </div>
      </section>

      <section className="overview-vessels" aria-labelledby="registered-vessels-title">
        <SectionHeader
          title="Registered Vessels"
          description="Vessel records will appear here when available."
        />
        <DataTable>
          <EmptyState title="No registered vessels" message="Vessel data is not available yet." />
        </DataTable>
      </section>
    </div>
  );
}

