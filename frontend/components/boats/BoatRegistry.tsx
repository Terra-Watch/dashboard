"use client";

import { useEffect, useState, FormEvent } from "react";
import { Boat, Device, fetchBoats, fetchDevices, fetchUsers, registerBoat as registerBoatApi, AdminUser } from "../../lib/api";
import { Card } from "../ui/Card";
import { DataTable } from "../ui/DataTable";
import { SectionHeader } from "../ui/SectionHeader";
import { StatusBadge } from "../ui/StatusBadge";
import Link from "next/link";
import { useAuth } from "../../lib/family/authContext";

export function BoatRegistry() {
  const [boats, setBoats] = useState<Boat[]>([]);
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const { isAdmin } = useAuth();

  useEffect(() => {
    let mounted = true;

    async function loadBoats() {
      const [data, userData, deviceData] = await Promise.all([fetchBoats(), isAdmin ? fetchUsers() : Promise.resolve([]), isAdmin ? fetchDevices() : Promise.resolve([])]);
      if (!mounted) return;
      setBoats(data);
      setUsers(userData);
      setDevices(deviceData);
      setLoading(false);
    }

    loadBoats();
    const interval = setInterval(loadBoats, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [isAdmin]);

  const filteredBoats = boats.filter(
    (b) =>
      b.boatId.toLowerCase().includes(identifier.toLowerCase()) ||
      b.nodeId != null && b.nodeId.toString().includes(identifier)
  );

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
  }

  async function handleRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const created = await registerBoatApi({ boatId: String(form.get("boatId")), nodeId: form.get("nodeId") ? Number(form.get("nodeId")) : undefined, deviceId: String(form.get("deviceId") || "") || undefined, ownerUserId: String(form.get("ownerUserId") || "") || undefined, commanderUserId: String(form.get("commanderUserId") || "") || undefined, familyUserIds: String(form.get("familyUserId") || "") ? [String(form.get("familyUserId"))] : [] });
    setBoats((current) => [created, ...current]); setShowRegister(false); event.currentTarget.reset();
  }

  return (
    <div className="boats-page">
      <header className="boats-header">
        <h1>Boats</h1>
        <p>Registered vessels and their current operational status over LoRa.</p>
      </header>

      {isAdmin && <section className="boats-controls" aria-label="Register vessel"><button className="ui-button" type="button" onClick={() => setShowRegister((current) => !current)}>{showRegister ? "Close registration" : "Register boat"}</button>{showRegister && <Card className="admin-create-card"><div className="section-header"><div><h2>Register boat</h2><p>Use existing accounts and registered devices. Relationships remain auditable.</p></div></div><form className="profile-form" onSubmit={(event) => void handleRegister(event)}><label>Boat identifier<input name="boatId" required placeholder="AP-07-FISH-12" /></label><label>Node ID<input name="nodeId" type="number" min="0" /></label><label>Registered device<select name="deviceId" defaultValue=""><option value="">No device yet</option>{devices.filter((device) => device.status === "UNASSOCIATED").map((device) => <option value={device.deviceId} key={device.id}>{device.deviceId} · node {device.nodeId ?? "—"}</option>)}</select></label><label>Owner<select name="ownerUserId" defaultValue=""><option value="">Not assigned</option>{users.filter((user) => user.role === "FISHERMAN").map((user) => <option value={user.id} key={user.id}>{user.name} · {user.email}</option>)}</select></label><label>Commander<select name="commanderUserId" defaultValue=""><option value="">Not assigned</option>{users.filter((user) => user.role === "FISHERMAN").map((user) => <option value={user.id} key={user.id}>{user.name} · {user.email}</option>)}</select></label><label>Family viewer<select name="familyUserId" defaultValue=""><option value="">No family access</option>{users.filter((user) => user.role === "FAMILY").map((user) => <option value={user.id} key={user.id}>{user.name} · {user.email}</option>)}</select></label><button className="ui-button" type="submit">Register boat</button></form></Card>}</section>}

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
                    <th style={{ padding: "0.75rem 1rem" }}>TOTAL HEARTBEATS</th>
                    <th style={{ padding: "0.75rem 1rem" }}>LAST OBSERVED SIGNAL (RSSI / SNR)</th>
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
                        <Link href={`/dashboard/boats/${encodeURIComponent(boat.boatId)}`}>{boat.boatId}</Link>
                      </td>
                      <td style={{ padding: "0.75rem 1rem", color: "#38bdf8" }}>
                        {boat.nodeId == null ? "—" : `#${boat.nodeId}`}
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
                        <small style={{ display: "block", marginTop: "0.25rem" }}>Observed at last seen</small>
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
