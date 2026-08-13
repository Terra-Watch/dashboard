import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="gateway-empty-state">
      <p className="gateway-empty-title">{title}</p>
      <p className="gateway-empty-message">{message}</p>
    </div>
  );
}

export function GatewayOverview() {
  return (
    <div className="gateway-page">
      <header className="gateway-header">
        <h1>Gateway</h1>
        <p>Gateway connection and communication status.</p>
      </header>

      <section className="gateway-status-section" aria-label="Gateway status">
        <SectionHeader title="Gateway Status" />
        <Card className="gateway-status-panel">
          <div className="gateway-status-content">
            <div>
              <p className="gateway-status-title">Gateway status unavailable</p>
              <p className="gateway-status-message">
                Gateway connection information is not currently available.
              </p>
            </div>
            <StatusBadge label="Unavailable" />
          </div>
        </Card>
      </section>

      <section className="gateway-information-section" aria-label="Gateway information">
        <div className="gateway-two-column">
          <Card className="gateway-detail-panel">
            <SectionHeader title="Gateway Information" />
            <EmptyState
              title="Gateway information unavailable"
              message="Gateway identity and operational details are not currently available."
            />
          </Card>

          <Card className="gateway-detail-panel">
            <SectionHeader title="Communication" />
            <EmptyState
              title="Communication information unavailable"
              message="Gateway communication details will appear here when data is available."
            />
          </Card>
        </div>
      </section>

      <section className="gateway-activity-section" aria-label="Recent gateway activity">
        <SectionHeader title="Recent Gateway Activity" />
        <DataTable>
          <div className="gateway-activity-empty">
            <p className="gateway-empty-title">No gateway activity</p>
            <p className="gateway-empty-message">
              Gateway activity will appear here when data is available.
            </p>
          </div>
        </DataTable>
      </section>
    </div>
  );
}

