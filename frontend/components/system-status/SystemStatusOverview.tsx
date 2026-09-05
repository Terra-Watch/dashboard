"use client";

import { useEffect, useState } from "react";
import { fetchSystemStatus, SystemStatusResponse } from "../../lib/api";
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
  const [status, setStatus] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadStatus() {
      const data = await fetchSystemStatus();
      if (!mounted) return;
      setStatus(data);
      setLoading(false);
    }

    loadStatus();
    const interval = setInterval(loadStatus, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const componentSummary = status?.components ?? [];
  const overall: string = componentSummary.some((component) => component.status === "OFFLINE")
    ? "DEGRADED"
    : componentSummary.length > 0
      ? "ONLINE"
      : "UNAVAILABLE";

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
              <p className="system-status-summary-title">{loading ? "Checking backend health..." : overall === "UNAVAILABLE" ? "System status unavailable" : `System status: ${overall}`}</p>
              <p className="system-status-summary-message">
                {status ? "Live component status reported by the backend." : "No live system-status records are currently available."}
              </p>
            </div>
            <StatusBadge label={loading ? "Checking" : overall === "UNAVAILABLE" ? "Unavailable" : overall} tone={overall === "ONLINE" ? "healthy" : overall === "DEGRADED" ? "warning" : overall === "OFFLINE" ? "danger" : "neutral"} />
          </div>
        </Card>
      </section>

      <section className="system-status-components-section" aria-label="System components">
        <SectionHeader title="System Components" />
        <DataTable>
          {loading ? (
            <div className="system-status-components-empty">
              <EmptyState title="Loading system status..." message="Polling backend health status." />
            </div>
          ) : componentSummary.length === 0 ? (
            <div className="system-status-components-empty">
              <EmptyState title="No system components defined" message="The backend has not reported any system components yet." />
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", color: "#475569", fontSize: "0.85rem", fontWeight: 600 }}>
                  <th style={{ padding: "0.75rem 1rem" }}>COMPONENT</th>
                  <th style={{ padding: "0.75rem 1rem" }}>STATUS</th>
                </tr>
              </thead>
              <tbody>
                {componentSummary.map((component) => (
                  <tr key={component.component} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "0.85rem" }}>
                    <td style={{ padding: "0.6rem 1rem" }}>{component.component}</td>
                    <td style={{ padding: "0.6rem 1rem" }}><StatusBadge label={component.status} tone={component.status === "ONLINE" ? "healthy" : component.status === "DEGRADED" ? "warning" : component.status === "OFFLINE" ? "danger" : "neutral"} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataTable>
      </section>
    </div>
  );
}

