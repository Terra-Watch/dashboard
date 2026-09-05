"use client";

import { useEffect, useState } from "react";
import { fetchBoats, fetchTelemetry, Boat, TelemetryRecord } from "../../lib/api";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";

function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="telemetry-empty-state">
      <p className="telemetry-empty-title">{title}</p>
      <p className="telemetry-empty-message">{message}</p>
    </div>
  );
}

export function TelemetryOverview() {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [records, setRecords] = useState<TelemetryRecord[]>([]);
  const [selectedBoatId, setSelectedBoatId] = useState<string>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadData() {
      const boatsData = await fetchBoats();
      if (!mounted) return;
      setBoats(boatsData);
      if (boatsData.length > 0 && selectedBoatId === "all") {
        setSelectedBoatId(boatsData[0].boatId);
      }
      setLoading(false);
    }

    loadData();
    const interval = setInterval(loadData, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [selectedBoatId]);

  useEffect(() => {
    let mounted = true;

    async function loadTelemetry() {
      const boat = boats.find((item) => item.boatId === selectedBoatId);
      const data = await fetchTelemetry(boat?.id ?? undefined);
      if (!mounted) return;
      setRecords(data);
    }

    if (boats.length > 0 || selectedBoatId === "all") {
      loadTelemetry();
      const interval = setInterval(loadTelemetry, 3000);
      return () => {
        mounted = false;
        clearInterval(interval);
      };
    }

    return undefined;
  }, [boats, selectedBoatId]);

  const latestRecord = records.length > 0 ? records[records.length - 1] : null;
  const selectedBoat = boats.find((boat) => boat.boatId === selectedBoatId) ?? null;

  return (
    <div className="telemetry-page">
      <header className="telemetry-header">
        <h1>Telemetry</h1>
        <p>Technical telemetry received from Jalri devices.</p>
      </header>

      <section className="telemetry-device-section" aria-label="Device selection">
        <div className="telemetry-device-header">
          <label htmlFor="telemetry-device">Device</label>
          <StatusBadge label={selectedBoat ? selectedBoat.status : "Unavailable"} tone={selectedBoat?.status === "ONLINE" ? "healthy" : "neutral"} />
        </div>
        <select
          id="telemetry-device"
          value={selectedBoatId}
          onChange={(event) => setSelectedBoatId(event.target.value)}
          disabled={boats.length === 0}
        >
          {boats.length === 0 ? <option value="all">No devices available</option> : boats.map((boat) => <option key={boat.id} value={boat.boatId}>{boat.boatId}</option>)}
        </select>
      </section>

      <section className="telemetry-overview-section" aria-label="Telemetry overview">
        <SectionHeader title="Telemetry Overview" />
        <Card className="telemetry-overview-panel">
          {latestRecord ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: "1rem", padding: "1rem" }}>
              <div><p className="telemetry-empty-title" style={{ fontSize: "0.75rem" }}>Battery</p><p style={{ fontSize: "1.5rem", margin: "0.25rem 0" }}>{latestRecord.battery ?? "—"}</p></div>
              <div><p className="telemetry-empty-title" style={{ fontSize: "0.75rem" }}>RSSI</p><p style={{ fontSize: "1.5rem", margin: "0.25rem 0" }}>{latestRecord.rssi ?? "—"}</p></div>
              <div><p className="telemetry-empty-title" style={{ fontSize: "0.75rem" }}>SNR</p><p style={{ fontSize: "1.5rem", margin: "0.25rem 0" }}>{latestRecord.snr ?? "—"}</p></div>
              <div><p className="telemetry-empty-title" style={{ fontSize: "0.75rem" }}>Last Update</p><p style={{ fontSize: "1rem", margin: "0.25rem 0" }}>{new Date(latestRecord.timestamp).toLocaleString()}</p></div>
            </div>
          ) : (
            <EmptyState title="Telemetry data unavailable" message="No telemetry records are currently available." />
          )}
        </Card>
      </section>

      <section className="telemetry-data-section" aria-label="Technical data">
        <SectionHeader title="Technical Data" description="Detailed telemetry values from the backend." />
        <DataTable>
          {loading ? (
            <div className="telemetry-table-empty">
              <p className="telemetry-empty-title">Loading telemetry...</p>
            </div>
          ) : records.length === 0 ? (
            <div className="telemetry-table-empty">
              <p className="telemetry-empty-title">No technical data</p>
              <p className="telemetry-empty-message">Telemetry fields are not defined or available yet.</p>
            </div>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #e2e8f0", color: "#475569", fontSize: "0.85rem", fontWeight: 600 }}>
                  <th style={{ padding: "0.75rem 1rem" }}>TIME</th>
                  <th style={{ padding: "0.75rem 1rem" }}>BATTERY</th>
                  <th style={{ padding: "0.75rem 1rem" }}>RANGE</th>
                  <th style={{ padding: "0.75rem 1rem" }}>RSSI / SNR</th>
                  <th style={{ padding: "0.75rem 1rem" }}>BEATS</th>
                </tr>
              </thead>
              <tbody>
                {records.slice(-10).reverse().map((record) => (
                  <tr key={record.id} style={{ borderBottom: "1px solid #f1f5f9", fontSize: "0.85rem" }}>
                    <td style={{ padding: "0.6rem 1rem" }}>{new Date(record.timestamp).toLocaleString()}</td>
                    <td style={{ padding: "0.6rem 1rem" }}>{record.battery ?? "—"}</td>
                    <td style={{ padding: "0.6rem 1rem" }}>{record.location ? `${record.location.latitude}, ${record.location.longitude}` : "—"}</td>
                    <td style={{ padding: "0.6rem 1rem" }}>{record.rssi ?? "—"} / {record.snr ?? "—"}</td>
                    <td style={{ padding: "0.6rem 1rem" }}>{record.heartbeatCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </DataTable>
      </section>

      <section className="telemetry-history-section" aria-label="Telemetry history">
        <SectionHeader title="Telemetry History" />
        <Card className="telemetry-history-panel">
          {records.length === 0 ? (
            <EmptyState title="Telemetry history unavailable" message="Historical telemetry will appear here when data is available." />
          ) : (
            <div style={{ padding: "1rem" }}>
              {records.slice(-5).reverse().map((record) => (
                <div key={record.id} style={{ borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "0.5rem 0" }}>
                  <strong>{new Date(record.timestamp).toLocaleString()}</strong>
                  <div style={{ color: "#94a3b8", marginTop: "0.25rem" }}>Battery: {record.battery ?? "—"} • RSSI: {record.rssi ?? "—"} • SNR: {record.snr ?? "—"}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

