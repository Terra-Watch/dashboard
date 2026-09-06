"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card } from "../../../../components/ui/Card";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { Device, DeviceAssociationHistory, fetchDevice, fetchDeviceHistory } from "../../../../lib/api";

export default function DeviceDetailPage() {
  const params = useParams<{ deviceId: string }>();
  const id = decodeURIComponent(params.deviceId);
  const [device, setDevice] = useState<Device | null>(null);
  const [history, setHistory] = useState<DeviceAssociationHistory[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { Promise.all([fetchDevice(id), fetchDeviceHistory(id)]).then(([current, associations]) => { setDevice(current); setHistory(associations); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load device details.")); }, [id]);
  if (error) return <div className="family-state"><h1>Device unavailable</h1><p>{error}</p></div>;
  if (!device) return <div className="family-state"><p>Loading device details…</p></div>;
  return <div className="overview-page"><header className="overview-header"><p className="eyebrow">Administration / Devices</p><h1>{device.deviceId}</h1><p>Authoritative device identity and preserved association history.</p></header><Card><div className="section-header"><div><h2>Device detail</h2><p>{device.deviceType}</p></div><StatusBadge label={device.status} tone={device.status === "ACTIVE" ? "healthy" : "warning"} /></div><dl className="profile-detail-list"><div><dt>Device ID</dt><dd>{device.deviceId}</dd></div><div><dt>Current boat</dt><dd>{device.boatId || "Unassociated"}</dd></div><div><dt>Node ID</dt><dd>{device.nodeId ?? "Unassigned"}</dd></div><div><dt>Registered</dt><dd>{new Date(device.registeredAt).toLocaleString()}</dd></div><div><dt>Associated</dt><dd>{device.associatedAt ? new Date(device.associatedAt).toLocaleString() : "—"}</dd></div><div><dt>Last seen</dt><dd>{device.lastSeen ? new Date(device.lastSeen).toLocaleString() : "—"}</dd></div></dl></Card><Card><div className="section-header"><div><h2>Association history</h2><p>Historical boat associations are never rewritten.</p></div></div>{history.length === 0 ? <p className="profile-empty">No association history.</p> : <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Boat</th><th>Status</th><th>Started</th><th>Ended</th></tr></thead><tbody>{history.map((entry) => <tr key={entry.id}><td>{entry.boatId}</td><td><StatusBadge label={entry.status} tone={entry.status === "ACTIVE" ? "healthy" : "warning"} /></td><td>{new Date(entry.startedAt).toLocaleString()}</td><td>{entry.endedAt ? new Date(entry.endedAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>}</Card></div>;
}
