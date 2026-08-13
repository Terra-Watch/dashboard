import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";

export function HistoryRecords() {
  return (
    <div className="history-page">
      <header className="history-header">
        <h1>History</h1>
        <p>Review recorded operational events and system activity.</p>
      </header>

      <section className="history-filters" aria-label="History filters">
        <Card className="history-filter-panel">
          <label htmlFor="history-search">Search</label>
          <input
            id="history-search"
            type="search"
            placeholder="Search unavailable until records exist"
            disabled
          />
        </Card>
      </section>

      <section className="history-records" aria-label="Historical records">
        <SectionHeader title="Historical Records" />
        <DataTable>
          <div className="history-empty-state">
            <p className="history-empty-title">No historical records</p>
            <p className="history-empty-message">
              Historical operational records will appear here when data is available.
            </p>
          </div>
        </DataTable>
      </section>
    </div>
  );
}

