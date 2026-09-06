"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "../../components/ui/Card";
import { StatusBadge } from "../../components/ui/StatusBadge";
import { JalariLoading } from "../../components/ui/JalariLoading";
import { FamilyBoatMap } from "../../components/family/FamilyBoatMap";
import { useAuth } from "../../lib/family/authContext";
import { fetchBoatIncidents, fetchBoatTrips, fetchFamilyBoats } from "../../lib/family/familyApi";
import { useFamilySocket } from "../../lib/family/useFamilySocket";
import type { FamilyBoat, FamilyTrip, SOSIncident } from "../../lib/family/types";

const activeIncidentStatuses = new Set(["ACTIVE", "ACKNOWLEDGED", "DISPATCHED"]);
const formatTime = (value?: string | null) => { if (!value) return "Unavailable"; const date = new Date(value); return Number.isNaN(date.getTime()) ? "Unavailable" : date.toLocaleString(); };
const connectionTone = (status: FamilyBoat["connectionStatus"]) => status === "CONNECTED" ? "healthy" : status === "NO_RECENT_UPDATE" ? "warning" : "danger";

export default function FamilyHomePage() {
  const { user } = useAuth();
  const [boats, setBoats] = useState<FamilyBoat[]>([]);
  const [selectedBoatId, setSelectedBoatId] = useState<string>();
  const [incidents, setIncidents] = useState<SOSIncident[]>([]);
  const [trips, setTrips] = useState<FamilyTrip[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { lastEvent } = useFamilySocket(selectedBoatId);

  useEffect(() => { let active = true; fetchFamilyBoats().then((data) => { if (!active) return; setBoats(data); setSelectedBoatId((current) => current || data[0]?.boatId); }).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Unable to load authorized vessels.")).finally(() => active && setLoading(false)); return () => { active = false; }; }, []);
  const boat = useMemo(() => boats.find((item) => item.boatId === selectedBoatId) || boats[0], [boats, selectedBoatId]);
  useEffect(() => { if (!boat) return; let active = true; Promise.all([fetchBoatIncidents(boat.boatId), fetchBoatTrips(boat.boatId)]).then(([incidentData, tripData]) => { if (!active) return; setIncidents(incidentData); setTrips(tripData); }).catch((reason: unknown) => active && setError(reason instanceof Error ? reason.message : "Unable to load vessel history.")); return () => { active = false; }; }, [boat?.boatId]);
  useEffect(() => { if (!lastEvent) return; setBoats((current) => current.map((item) => { if (item.boatId.toLowerCase() !== lastEvent.boatId.toLowerCase()) return item; if (lastEvent.type === "boat.location.updated") return { ...item, latestLocation: { ...lastEvent, isLive: true }, lastSeen: lastEvent.timestamp, connectionStatus: "CONNECTED" }; if (lastEvent.type === "boat.status.updated") return { ...item, safetyStatus: lastEvent.status, tripState: lastEvent.tripState || item.tripState }; if (lastEvent.type === "sos.created") return { ...item, safetyStatus: "EMERGENCY", activeIncidentId: lastEvent.incidentId }; if (lastEvent.type === "sos.resolved") return { ...item, safetyStatus: "SAFE", activeIncidentId: null }; return item; })); }, [lastEvent]);

  if (loading) return <JalariLoading label="Loading authorized vessel data" />;
  if (error && boats.length === 0) return <div className="family-state"><h1>Family view unavailable</h1><p>{error}</p></div>;
  if (!boat) return <div className="family-state"><h1>No authorized vessels</h1><p>No vessel is currently linked to {user?.email || "this account"}.</p></div>;
  const activeIncident = incidents.find((incident) => activeIncidentStatuses.has(incident.status));
  return <div className="family-page">
    <header className="overview-header"><p className="eyebrow">Family monitoring</p><h1>Vessel status</h1><p>Current information for vessels authorized for your account.</p></header>
    {boats.length > 1 && <div className="family-vessel-selector"><label htmlFor="family-vessel">Vessel</label><select id="family-vessel" value={boat.boatId} onChange={(event) => setSelectedBoatId(event.target.value)}>{boats.map((item) => <option key={item.boatId} value={item.boatId}>{item.name || item.boatId} ({item.boatId})</option>)}</select></div>}
    {error && <div className="family-inline-notice" role="status">{error}</div>}
    <section className="family-vessel-grid"><Card><div className="section-header"><div><h2>{boat.name || "Unnamed vessel"}</h2><p>{boat.boatId} · {boat.registrationNumber || "Registration unavailable"}</p></div><StatusBadge label={boat.safetyStatus} tone={boat.safetyStatus === "SAFE" ? "healthy" : boat.safetyStatus === "WARNING" ? "warning" : "danger"} /></div><dl className="family-detail-list"><div><dt>Connection</dt><dd><StatusBadge label={boat.connectionStatus.replaceAll("_", " ")} tone={connectionTone(boat.connectionStatus)} /></dd></div><div><dt>Trip state</dt><dd>{boat.tripState.replaceAll("_", " ")}</dd></div><div><dt>Last update</dt><dd>{formatTime(boat.lastSeen)}</dd></div><div><dt>Home port</dt><dd>{boat.homePort || "Unavailable"}</dd></div></dl></Card><Card><div className="section-header"><div><h2>Safety and connection</h2><p>Reported by the Jalari backend</p></div><StatusBadge label={activeIncident ? "ACTIVE SOS" : "No active SOS"} tone={activeIncident ? "danger" : "neutral"} /></div><p className="family-safety-message">{activeIncident ? activeIncident.statusLabel : boat.safetyStatus === "WARNING" ? "A vessel warning is currently reported." : "No active emergency is reported for this vessel."}</p>{activeIncident && <a className="ui-button family-action-link" href={`/family/incident/${activeIncident.id}`}>View incident details</a>}</Card></section>
    <section className="family-section"><div className="section-header"><div><h2>Live location</h2><p>{boat.latestLocation ? `Reported ${formatTime(boat.latestLocation.timestamp)}` : "No location has been reported."}</p></div></div>{boat.latestLocation ? <FamilyBoatMap boatId={boat.boatId} boatName={boat.name || boat.boatId} location={boat.latestLocation} status={boat.safetyStatus} height="420px" /> : <Card className="family-empty-panel"><p>Location unavailable</p><span>The backend has not reported a current position for this vessel.</span></Card>}</section>
    <section className="family-history-grid"><Card><div className="section-header"><div><h2>Recent incidents</h2><p>Recorded SOS events for this vessel</p></div></div>{incidents.length === 0 ? <p className="family-muted">No incidents returned.</p> : <ul className="family-record-list">{incidents.slice(0, 3).map((incident) => <li key={incident.id}><span>{incident.statusLabel}</span><small>{formatTime(incident.timestamp)}</small></li>)}</ul>}</Card><Card><div className="section-header"><div><h2>Recent trips</h2><p>Recorded trips for this vessel</p></div></div>{trips.length === 0 ? <p className="family-muted">No trips returned.</p> : <ul className="family-record-list">{trips.slice(0, 3).map((trip) => <li key={trip.id}><span>{trip.title || trip.status}</span><small>{formatTime(trip.startTime)}</small></li>)}</ul>}</Card></section>
  </div>;
}
