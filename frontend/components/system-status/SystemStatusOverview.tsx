import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="system-status-empty-state">
      <p className="system-status-empty-title">{title}</p>
      <p className="system-status-empty-message">{message}</p>
    </div>
  );
}

export function SystemStatusOverview() {
  return (
    <div className="system-status-page">
      <header className="system-status-header">
        <h1>System Status</h1>
        <p>System components and service availability.</p>
      </header>

      <section className="system-status-summary-section" aria-label="System summary">
        <SectionHeader title="System Summary" />
        <Card className="system-status-summary-panel">
          <div className="system-status-summary-content">
            <div>
              <p className="system-status-summary-title">System status unavailable</p>
              <p className="system-status-summary-message">
                No live system-status records are currently available.
              </p>
            </div>
            <StatusBadge label="Unavailable" />
          </div>
        </Card>
      </section>

      <section className="system-status-components-section" aria-label="System components">
        <SectionHeader title="System Components" />
        <DataTable>
          <div className="system-status-components-empty">
            <EmptyState
              title="No system components defined"
              message="System component status will appear here when the architecture and data source are defined."
            />
          </div>
        </DataTable>
      </section>
    </div>
  );
}

