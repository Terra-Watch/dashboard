"use client";

import { useEffect, useState } from "react";
import { fetchAlerts, Alert } from "../../lib/api";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="alerts-empty-state">
      <p className="alerts-empty-title">{title}</p>
      <p className="alerts-empty-message">{message}</p>
    </div>
  );
}

function SummaryCard({ label, value, supportingText }: { label: string; value: string | number; supportingText: string }) {
  return (
    <Card className="alerts-summary-card">
      <p className="alerts-summary-label">{label}</p>
      <p className="alerts-summary-value" aria-label={`${label}: ${value}`}>{value}</p>
      <p className="alerts-summary-supporting">{supportingText}</p>
    </Card>
  );
}

export function AlertsOverview() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadAlerts() {
      const data = await fetchAlerts();
      if (!mounted) return;
      setAlerts(data);
      setLoading(false);
    }

    loadAlerts();
    const interval = setInterval(loadAlerts, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const activeAlerts = alerts.filter((alert) => alert.status === "ACTIVE" || alert.status === "ACKNOWLEDGED");
  const sosEvents = alerts.filter((alert) => alert.type === "SOS");
  const resolvedAlerts = alerts.filter((alert) => alert.status === "RESOLVED").length;

  return (
    <div className="alerts-page">
      <header className="alerts-header">
        <h1>Alerts &amp; SOS</h1>
        <p>Monitor emergency events and operational alerts.</p>
      </header>

      <section className="alerts-summary" aria-label="Alert summary">
        <SummaryCard label="ACTIVE ALERTS" value={loading ? "..." : activeAlerts.length} supportingText={activeAlerts.length > 0 ? "Open or acknowledged alerts" : "No open alert data"} />
        <SummaryCard label="SOS EVENTS" value={loading ? "..." : sosEvents.length} supportingText={sosEvents.length > 0 ? "Emergency calls currently in record" : "No SOS data"} />
        <SummaryCard label="RESOLVED" value={loading ? "..." : resolvedAlerts} supportingText={resolvedAlerts > 0 ? "Resolved events logged" : "No resolution data"} />
      </section>

      <section className="alerts-primary-section" aria-label="Active alerts">
        <SectionHeader title="Active Alerts" />
        <Card className="alerts-empty-panel">
          {activeAlerts.length === 0 ? (
            <EmptyState title="No active alerts" message="There are currently no active alert records available." />
          ) : (
            <div style={{ display: "grid", gap: "0.75rem", padding: "1rem" }}>
              {activeAlerts.map((alert) => (
                <div key={alert.id} style={{ border: "1px solid rgba(255,255,255,0.08)", borderRadius: "8px", padding: "0.9rem 1rem" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.75rem" }}>
                    <strong>{alert.type}</strong>
                    <StatusBadge label={alert.status} tone={alert.status === "ACTIVE" ? "danger" : "warning"} />
                  </div>
                  <p style={{ marginTop: "0.5rem", color: "#cbd5e1" }}>{alert.message}</p>
                  <small style={{ display: "block", marginTop: "0.5rem", color: "#94a3b8" }}>
                    {new Date(alert.createdAt).toLocaleString()} • Severity: {alert.severity}
                  </small>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="alerts-sos-section" aria-label="SOS events">
        <SectionHeader title="SOS Events" />
        <Card className="alerts-empty-panel alerts-sos-panel">
          {sosEvents.length === 0 ? (
            <EmptyState title="No SOS events" message="There are currently no SOS records available." />
          ) : (
            <div style={{ display: "grid", gap: "0.75rem", padding: "1rem" }}>
              {sosEvents.slice(0, 5).map((alert) => (
                <div key={alert.id} style={{ display: "flex", justifyContent: "space-between", gap: "1rem", borderBottom: "1px solid rgba(255,255,255,0.08)", paddingBottom: "0.5rem" }}>
                  <div>
                    <strong>{alert.message}</strong>
                    <div style={{ color: "#94a3b8", fontSize: "0.8rem", marginTop: "0.25rem" }}>{new Date(alert.createdAt).toLocaleString()}</div>
                  </div>
                  <StatusBadge label={alert.status} tone={alert.status === "RESOLVED" ? "healthy" : "danger"} />
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section className="alerts-table-section" aria-label="Alert records">
        <SectionHeader title="Alert Records" description="Latest records from the backend alert stream." />
        <DataTable>
          {loading ? (
            <div className="alerts-table-empty">
              <p className="alerts-empty-title">Loading alerts...</p>
            </div>
          ) : alerts.length === 0 ? (
            <div className="alerts-table-empty">
              <p className="alerts-empty-title">No alert records</p>
              <p className="alerts-empty-message">The backend has not reported any alerts yet.</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", color: "#475569", fontSize: "0.85rem", fontWeight: 600 }}>
                  <th style={{ padding: "0.75rem 1rem" }}>TIME</th>
                  <th style={{ padding: "0.75rem 1rem" }}>TYPE</th>
                  <th style={{ padding: "0.75rem 1rem" }}>SEVERITY</th>
                  <th style={{ padding: "0.75rem 1rem" }}>STATUS</th>
                  <th style={{ padding: "0.75rem 1rem" }}>MESSAGE</th>
                </tr>
              </thead>
              <tbody>
                {alerts.slice(0, 12).map((alert) => (
                  <tr key={alert.id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "0.85rem" }}>
                    <td style={{ padding: "0.6rem 1rem" }}>{new Date(alert.createdAt).toLocaleString()}</td>
                    <td style={{ padding: "0.6rem 1rem" }}>{alert.type}</td>
                    <td style={{ padding: "0.6rem 1rem" }}>{alert.severity}</td>
                    <td style={{ padding: "0.6rem 1rem" }}><StatusBadge label={alert.status} tone={alert.status === "ACTIVE" ? "danger" : alert.status === "ACKNOWLEDGED" ? "warning" : "healthy"} /></td>
                    <td style={{ padding: "0.6rem 1rem" }}>{alert.message}</td>
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

