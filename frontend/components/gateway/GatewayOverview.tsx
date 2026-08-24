"use client";

import { useEffect, useState } from "react";
import { fetchGateways, fetchHistory, Gateway, HistoricalEvent } from "../../lib/api";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";

export function GatewayOverview() {
  const [history, setHistory] = useState<HistoricalEvent[]>([]);
  const [gateway, setGateway] = useState<Gateway | null>(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [data, gateways] = await Promise.all([fetchHistory(), fetchGateways()]);
      if (!mounted) return;
      setHistory(data);
      setGateway(gateways[0] ?? null);
    }

    load();
    const interval = setInterval(load, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="gateway-page">
      <header className="gateway-header">
        <h1>Gateway</h1>
        <p>Gateway connection and LoRa ↔ Wi-Fi bridge communication status.</p>
      </header>

      <section className="gateway-status-section" aria-label="Gateway status">
        <SectionHeader title="Gateway Status" />
        <Card className="gateway-status-panel">
          <div className="gateway-status-content" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <p className="gateway-status-title" style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                {gateway ? `Shore Gateway (${gateway.gatewayId})` : "Shore Gateway unavailable"}
              </p>
              <p className="gateway-status-message" style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                {gateway
                  ? `Gateway record reported ${gateway.status.toLowerCase()} at ${new Date(gateway.lastSeen).toLocaleString()}.`
                  : "No gateway record is currently available from the backend."}
              </p>
            </div>
            <StatusBadge
              label={gateway?.status ?? "UNAVAILABLE"}
              tone={gateway?.status === "ONLINE" ? "healthy" : "neutral"}
            />
          </div>
        </Card>
      </section>

      <section className="gateway-information-section" aria-label="Gateway information">
        <div className="gateway-two-column">
          <Card className="gateway-detail-panel" style={{ padding: "1.25rem" }}>
            <SectionHeader title="Gateway Hardware & Network" />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.9rem", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Hardware:</span>
                <strong>ESP32-S3 + Semtech SX1278</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Gateway ID:</span>
                <span style={{ color: "#38bdf8", fontWeight: 600 }}>0xFE (254)</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Network SSID:</span>
                <strong>JalriHotspot (2.4 GHz)</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Backend Target:</span>
                <span style={{ color: "#a78bfa" }}>http://172.20.10.3:8000</span>
              </div>
            </div>
          </Card>

          <Card className="gateway-detail-panel" style={{ padding: "1.25rem" }}>
            <SectionHeader title="LoRa RF Interface" />
            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.9rem", marginTop: "1rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Frequency:</span>
                <strong>433.000 MHz</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Modulation:</span>
                <strong>LoRa (SF7, BW 125kHz, CR 4/5)</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Sync Word:</span>
                <strong>0x12 (CRC-16 CCITT)</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#94a3b8" }}>Packets Ingested:</span>
                <span style={{ color: "#4ade80", fontWeight: 600 }}>{history.length} Packets</span>
              </div>
            </div>
          </Card>
        </div>
      </section>

      <section className="gateway-activity-section" aria-label="Recent gateway activity">
        <SectionHeader title="Recent Ingested Activity" />
        <Card className="boats-table-card">
          <DataTable>
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", color: "#475569", fontSize: "0.85rem", fontWeight: 600 }}>
                  <th style={{ padding: "0.75rem 1rem" }}>TIMESTAMP</th>
                  <th style={{ padding: "0.75rem 1rem" }}>EVENT</th>
                  <th style={{ padding: "0.75rem 1rem" }}>NODE ID</th>
                  <th style={{ padding: "0.75rem 1rem" }}>PACKET ID</th>
                  <th style={{ padding: "0.75rem 1rem" }}>RSSI / SNR</th>
                  <th style={{ padding: "0.75rem 1rem" }}>INGESTION STATUS</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map((evt) => (
                  <tr key={evt.id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "0.85rem" }}>
                    <td style={{ padding: "0.6rem 1rem", color: "#334155", fontWeight: 500 }}>
                      {new Date(evt.timestamp).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: "0.6rem 1rem" }}>
                      <span
                        style={{
                          background: "#dcfce7",
                          color: "#15803d",
                          padding: "4px 8px",
                          borderRadius: "4px",
                          fontWeight: 600,
                          fontSize: "0.75rem",
                          border: "1px solid #bbf7d0",
                          display: "inline-block",
                        }}
                      >
                        {evt.eventType}
                      </span>
                    </td>
                    <td style={{ padding: "0.6rem 1rem", color: "#0284c7", fontWeight: 600 }}>
                      #{evt.details?.nodeId ?? "—"}
                    </td>
                    <td style={{ padding: "0.6rem 1rem", color: "#334155" }}>
                      #{evt.details?.packetId ?? "—"}
                    </td>
                    <td style={{ padding: "0.6rem 1rem", color: "#475569" }}>
                      {evt.details?.rssi} dBm / {evt.details?.snr} dB
                    </td>
                    <td style={{ padding: "0.6rem 1rem" }}>
                      <StatusBadge label="202 ACCEPTED" tone="healthy" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTable>
        </Card>
      </section>
    </div>
  );
}
