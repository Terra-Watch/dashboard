"use client";

import { useEffect, useState } from "react";
import { fetchHistory, HistoricalEvent } from "../../lib/api";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";

export function HistoryRecords() {
  const [history, setHistory] = useState<HistoricalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let mounted = true;

    async function loadHistory() {
      const data = await fetchHistory();
      if (!mounted) return;
      setHistory(data);
      setLoading(false);
    }

    loadHistory();
    const interval = setInterval(loadHistory, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const filtered = history.filter(
    (item) =>
      item.eventType.toLowerCase().includes(search.toLowerCase()) ||
      item.details?.nodeId?.toString().includes(search) ||
      item.details?.packetId?.toString().includes(search)
  );

  return (
    <div className="history-page">
      <header className="history-header">
        <h1>Event History</h1>
        <p>Review recorded LoRa packets and operational system activity.</p>
      </header>

      <section className="history-filters" aria-label="History filters">
        <Card className="history-filter-panel">
          <label htmlFor="history-search">Search Events</label>
          <input
            id="history-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by Event Type, Node ID, or Packet ID..."
          />
        </Card>
      </section>

      <section className="history-records" aria-label="Historical records">
        <SectionHeader title={`Historical Records (${filtered.length} Events)`} />
        <Card className="boats-table-card">
          <DataTable>
            {loading ? (
              <div className="history-empty-state">
                <p className="history-empty-title">Loading history logs...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="history-empty-state">
                <p className="history-empty-title">No historical records</p>
                <p className="history-empty-message">
                  {search ? "No events match your filter." : "Historical operational records will appear here when data is available."}
                </p>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e2e8f0", color: "#475569", fontSize: "0.85rem", fontWeight: 600 }}>
                    <th style={{ padding: "0.75rem 1rem" }}>TIMESTAMP</th>
                    <th style={{ padding: "0.75rem 1rem" }}>EVENT TYPE</th>
                    <th style={{ padding: "0.75rem 1rem" }}>NODE ID</th>
                    <th style={{ padding: "0.75rem 1rem" }}>PACKET ID</th>
                    <th style={{ padding: "0.75rem 1rem" }}>RSSI</th>
                    <th style={{ padding: "0.75rem 1rem" }}>SNR</th>
                    <th style={{ padding: "0.75rem 1rem" }}>SIZE</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 50).map((item) => (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: "1px solid #f1f5f9",
                        fontSize: "0.85rem",
                      }}
                    >
                      <td style={{ padding: "0.6rem 1rem", color: "#334155", fontWeight: 500 }}>
                        {new Date(item.timestamp).toLocaleTimeString()}
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
                          {item.eventType}
                        </span>
                      </td>
                      <td style={{ padding: "0.6rem 1rem", color: "#0284c7", fontWeight: 600 }}>
                        {item.details?.nodeId != null ? `#${item.details.nodeId}` : "—"}
                      </td>
                      <td style={{ padding: "0.6rem 1rem", color: "#334155" }}>
                        {item.details?.packetId != null ? `#${item.details.packetId}` : "—"}
                      </td>
                      <td style={{ padding: "0.6rem 1rem", color: "#b91c1c", fontWeight: 500 }}>
                        {item.details?.rssi != null ? `${item.details.rssi} dBm` : "—"}
                      </td>
                      <td style={{ padding: "0.6rem 1rem", color: "#15803d", fontWeight: 500 }}>
                        {item.details?.snr != null ? `${item.details.snr} dB` : "—"}
                      </td>
                      <td style={{ padding: "0.6rem 1rem", color: "#64748b" }}>
                        {item.details?.packetSize != null ? `${item.details.packetSize} B` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </DataTable>
        </Card>
      </section>
    </div>
  );
}
