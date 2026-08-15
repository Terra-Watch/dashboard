"use client";

import { useEffect, useState } from "react";
import { fetchBoats, fetchHistory, Boat, HistoricalEvent } from "../../lib/api";
import { Card } from "../ui/Card";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";
import { LiveMapWorkspace } from "../map/LiveMapWorkspace";

function Metric({ label, value, supportingText }: { label: string; value: string | number; supportingText: string }) {
  return (
    <Card className="overview-metric">
      <p className="overview-metric-label">{label}</p>
      <p className="overview-metric-value">{value}</p>
      <p className="overview-metric-supporting">{supportingText}</p>
    </Card>
  );
}

export function Overview() {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [history, setHistory] = useState<HistoricalEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      const [boatsData, historyData] = await Promise.all([fetchBoats(), fetchHistory()]);
      if (!mounted) return;
      setBoats(boatsData);
      setHistory(historyData);
      setLoading(false);
    }

    loadData();
    const interval = setInterval(loadData, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const totalVessels = boats.length;
  const onlineVessels = boats.filter((b) => b.status === "ONLINE").length;
  const activeAlerts = boats.filter((b) => b.sos).length;

  return (
    <div className="overview-page">
      <header className="overview-header">
        <h1>Fleet Overview</h1>
        <p>Current operational status of registered vessels connected over LoRa.</p>
      </header>

      <section className="overview-section" aria-labelledby="fleet-summary-title">
        <h2 id="fleet-summary-title" className="sr-only">Fleet summary</h2>
        <div className="overview-metrics">
          <Metric
            label="TOTAL VESSELS"
            value={loading ? "..." : totalVessels}
            supportingText={totalVessels > 0 ? `${totalVessels} vessel registered` : "No registered vessel data"}
          />
          <Metric
            label="ONLINE"
            value={loading ? "..." : onlineVessels}
            supportingText={onlineVessels > 0 ? `${onlineVessels} vessel active on LoRa` : "No connection data"}
          />
          <Metric
            label="ACTIVE ALERTS"
            value={loading ? "..." : activeAlerts}
            supportingText={activeAlerts === 0 ? "All vessels normal" : `${activeAlerts} active emergency`}
          />
        </div>
      </section>

      <section className="overview-workspace" aria-label="Main operational workspace" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        <LiveMapWorkspace />

        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: "1.5rem" }}>
          <Card className="overview-position-panel">
            <SectionHeader title="Active Vessels" />
            {boats.length === 0 ? (
              <div className="overview-empty-state">
                <p className="overview-empty-title">No vessels registered</p>
                <p className="overview-empty-message">Vessel telemetry will appear here when available.</p>
              </div>
            ) : (
            <div style={{ padding: "1rem" }}>
              {boats.map((b) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "0.75rem 1rem",
                    background: "rgba(255, 255, 255, 0.03)",
                    borderRadius: "8px",
                    marginBottom: "0.5rem",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                  }}
                >
                  <div>
                    <strong style={{ fontSize: "1.1rem" }}>{b.boatId}</strong>
                    <span style={{ marginLeft: "0.5rem", color: "#888", fontSize: "0.9rem" }}>
                      (Node ID: {b.nodeId})
                    </span>
                    <div style={{ fontSize: "0.85rem", color: "#aaa", marginTop: "0.25rem" }}>
                      Heartbeats: {b.heartbeatCount} | RSSI: {b.rssi ?? "—"} dBm | SNR: {b.snr ?? "—"} dB
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <StatusBadge label={b.status} tone={b.status === "ONLINE" ? "healthy" : "danger"} />
                    <div style={{ fontSize: "0.75rem", color: "#888", marginTop: "0.25rem" }}>
                      {new Date(b.lastSeen).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <div className="overview-side-column">
          <Card className="overview-side-panel overview-alerts-panel">
            <SectionHeader title="Active Alerts" />
            <div className="overview-empty-state" style={{ padding: "1rem" }}>
              <p className="overview-empty-title" style={{ color: "#4ade80" }}>
                ✓ No active alerts
              </p>
              <p className="overview-empty-message">System is currently clear. All vessels nominal.</p>
            </div>
          </Card>

          <Card className="overview-side-panel">
            <SectionHeader title="Recent Activity" />
            {history.length === 0 ? (
              <div className="overview-empty-state">
                <p className="overview-empty-title">No recent activity.</p>
              </div>
            ) : (
              <div style={{ maxHeight: "300px", overflowY: "auto", padding: "0.5rem 1rem" }}>
                {history.slice(0, 8).map((evt) => (
                  <div
                    key={evt.id}
                    style={{
                      padding: "0.6rem 0",
                      borderBottom: "1px solid #f1f5f9",
                      fontSize: "0.85rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span
                        style={{
                          background: "#dcfce7",
                          color: "#15803d",
                          padding: "2px 6px",
                          borderRadius: "4px",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          border: "1px solid #bbf7d0",
                        }}
                      >
                        {evt.details?.nodeId ? `NODE #${evt.details.nodeId}` : "NODE"} • {evt.eventType}
                      </span>
                      <span style={{ color: "#64748b", fontSize: "0.75rem", fontWeight: 500 }}>
                        {new Date(evt.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                    {evt.details && (
                      <div style={{ color: "#475569", fontSize: "0.75rem", marginTop: "4px" }}>
                        Packet <b>#{evt.details.packetId}</b> | RSSI: <b style={{ color: "#b91c1c" }}>{evt.details.rssi} dBm</b> | SNR: <b style={{ color: "#15803d" }}>{evt.details.snr} dB</b>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
        </div>
      </section>
    </div>
  );
}
