import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="alerts-empty-state">
      <p className="alerts-empty-title">{title}</p>
      <p className="alerts-empty-message">{message}</p>
    </div>
  );
}

function SummaryCard({ label, supportingText }: { label: string; supportingText: string }) {
  return (
    <Card className="alerts-summary-card">
      <p className="alerts-summary-label">{label}</p>
      <p className="alerts-summary-value" aria-label={`${label}: not available`}>—</p>
      <p className="alerts-summary-supporting">{supportingText}</p>
    </Card>
  );
}

export function AlertsOverview() {
  return (
    <div className="alerts-page">
      <header className="alerts-header">
        <h1>Alerts &amp; SOS</h1>
        <p>Monitor emergency events and operational alerts.</p>
      </header>

      <section className="alerts-summary" aria-label="Alert summary">
        <SummaryCard label="ACTIVE ALERTS" supportingText="No alert data" />
        <SummaryCard label="SOS EVENTS" supportingText="No SOS data" />
        <SummaryCard label="RESOLVED" supportingText="No resolution data" />
      </section>

      <section className="alerts-primary-section" aria-label="Active alerts">
        <SectionHeader title="Active Alerts" />
        <Card className="alerts-empty-panel">
          <EmptyState
            title="No active alerts"
            message="There are currently no alert records available."
          />
        </Card>
      </section>

      <section className="alerts-sos-section" aria-label="SOS events">
        <SectionHeader title="SOS Events" />
        <Card className="alerts-empty-panel alerts-sos-panel">
          <EmptyState
            title="No SOS events"
            message="There are currently no SOS records available."
          />
        </Card>
      </section>

      <section className="alerts-table-section" aria-label="Alert records">
        <SectionHeader title="Alert Records" description="Alert details will appear here when available." />
        <DataTable>
          <div className="alerts-table-empty">
            <p className="alerts-empty-title">No alert records</p>
            <p className="alerts-empty-message">Alert data is not available yet.</p>
          </div>
        </DataTable>
      </section>
    </div>
  );
}

