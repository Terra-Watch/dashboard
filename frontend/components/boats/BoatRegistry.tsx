"use client";

import { useEffect, useState, FormEvent } from "react";
import { fetchBoats, Boat } from "../../lib/api";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";

export function BoatRegistry() {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadBoats() {
      const data = await fetchBoats();
      if (!mounted) return;
      setBoats(data);
      setLoading(false);
    }

    loadBoats();
    const interval = setInterval(loadBoats, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const filteredBoats = boats.filter(
    (b) =>
      b.boatId.toLowerCase().includes(identifier.toLowerCase()) ||
      b.nodeId.toString().includes(identifier)
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  return (
    <div className="boats-page">
      <header className="boats-header">
        <h1>Boats</h1>
        <p>Registered vessels and their current operational status over LoRa.</p>
      </header>

      <section className="boats-controls" aria-label="Vessel registry search">
        <form className="boat-search" onSubmit={handleSearch}>
          <label htmlFor="boat-identifier">Search</label>
          <div className="boat-search-row">
            <input
              id="boat-identifier"
              name="boat-identifier"
              type="search"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Search by Boat ID or Node ID..."
            />
            <button type="submit">Search</button>
          </div>
        </form>
      </section>

      <section className="boats-registry" aria-label="Registered vessels">
        <SectionHeader title="Registered Vessels" />
        <Card className="boats-table-card">
          <DataTable>
            {loading ? (
              <div className="boats-table-empty">
                <p className="boats-empty-title">Loading vessels...</p>
              </div>
            ) : filteredBoats.length === 0 ? (
              <div className="boats-table-empty">
                <p className="boats-empty-title">No vessels registered</p>
                <p className="boats-empty-message">
                  {identifier ? "No vessels match your search query." : "There are currently no vessel records available."}
                </p>
              </div>
            ) : (
              <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)", color: "#888", fontSize: "0.85rem" }}>
                    <th style={{ padding: "0.75rem 1rem" }}>BOAT ID</th>
                    <th style={{ padding: "0.75rem 1rem" }}>NODE ID</th>
                    <th style={{ padding: "0.75rem 1rem" }}>STATUS</th>
                    <th style={{ padding: "0.75rem 1rem" }}>HEARTBEATS</th>
                    <th style={{ padding: "0.75rem 1rem" }}>SIGNAL (RSSI / SNR)</th>
                    <th style={{ padding: "0.75rem 1rem" }}>LAST SEEN</th>
                    <th style={{ padding: "0.75rem 1rem" }}>DATA SOURCE</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBoats.map((boat) => (
                    <tr
                      key={boat.id}
                      style={{
                        borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
                        fontSize: "0.9rem",
                      }}
                    >
                      <td style={{ padding: "0.75rem 1rem", fontWeight: 600, color: "#f1f5f9" }}>
                        {boat.boatId}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#38bdf8" }}>
                        #{boat.nodeId}
                      </td>
                      <td style={{ padding: "0.75rem 1rem" }}>
                        <StatusBadge
                          label={boat.status}
                          tone={boat.status === "ONLINE" ? "healthy" : "danger"}
                        />
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#cbd5e1" }}>
                        {boat.heartbeatCount}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>
                        {boat.rssi != null ? `${boat.rssi} dBm` : "—"} / {boat.snr != null ? `${boat.snr} dB` : "—"}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#94a3b8" }}>
                        {new Date(boat.lastSeen).toLocaleTimeString()}
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#64748b", textTransform: "uppercase", fontSize: "0.75rem" }}>
                        {boat.dataSource}
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
