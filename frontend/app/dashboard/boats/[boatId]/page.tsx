"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminUser, Boat, BoatAssignment, createBoatAssignment, endBoatAssignment, fetchBoat, fetchBoatAssignments, fetchUsers, setBoatLifecycle } from "../../../../lib/api";
import { Card } from "../../../../components/ui/Card";
import { StatusBadge } from "../../../../components/ui/StatusBadge";
import { useAuth } from "../../../../lib/family/authContext";

export default function BoatDetailsPage() {
  const params = useParams<{ boatId: string }>();
  const boatId = decodeURIComponent(params.boatId);
  const [boat, setBoat] = useState<Boat | null>(null);
  const [assignments, setAssignments] = useState<BoatAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assignmentUserId, setAssignmentUserId] = useState("");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [relationshipType, setRelationshipType] = useState("FAMILY_VIEWER");
  const { isAdmin } = useAuth();

  useEffect(() => {
    let mounted = true;
    Promise.all([fetchBoat(boatId), fetchBoatAssignments(boatId), isAdmin ? fetchUsers() : Promise.resolve([])])
      .then(([boatData, assignmentData, userData]) => {
        if (!mounted) return;
        setBoat(boatData);
        setAssignments(assignmentData);
        setUsers(userData);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load vessel details."))
      .finally(() => mounted && setLoading(false));
    return () => { mounted = false; };
  }, [boatId, isAdmin]);

  async function changeLifecycle(action: "suspend" | "restore" | "deactivate" | "archive") {
    if (!boat || !window.confirm(`Confirm ${action} for ${boat.boatId}?`)) return;
    try { setBoat(await setBoatLifecycle(boat.boatId, action)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update vessel lifecycle."); }
  }

  async function addAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!assignmentUserId.trim()) return;
    try {
      const created = await createBoatAssignment(boatId, { userId: assignmentUserId.trim(), relationshipType });
      setAssignments((current) => [...current.filter((item) => item.userId !== created.userId), created]);
      setAssignmentUserId("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create assignment."); }
  }

  async function endAssignment(userId: string) {
    if (!window.confirm("End this boat relationship? The user account will remain active.")) return;
    try { const ended = await endBoatAssignment(boatId, userId); setAssignments((current) => current.map((item) => item.userId === userId ? ended : item)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to end assignment."); }
  }

  if (loading) return <div className="family-state"><p>Loading vessel details…</p></div>;
  if (error || !boat) return <div className="family-state"><h1>Vessel unavailable</h1><p>{error || "No vessel record was returned."}</p></div>;

  const activeAssignments = assignments.filter((item) => item.status === "ACTIVE");
  return (
    <div className="overview-page">
      <header className="overview-header">
        <p className="eyebrow">Boats / Vessel details</p>
        <h1>{boat.boatId}</h1>
        <p>Authoritative vessel, device, telemetry, and relationship state.</p>
      </header>
      <section className="profile-grid" aria-label="Vessel summary">
        <Card>
          <div className="section-header"><div><h2>Vessel status</h2><p>Operational state returned by the backend.</p></div><StatusBadge label={boat.lifecycleStatus || "ACTIVE"} tone={boat.lifecycleStatus === "ACTIVE" ? "healthy" : "warning"} /></div>
          <div className="profile-actions">{boat.lifecycleStatus === "ACTIVE" && <><button className="ui-button" type="button" onClick={() => void changeLifecycle("suspend")}>Suspend</button><button className="ui-button" type="button" onClick={() => void changeLifecycle("deactivate")}>Mark inactive</button></>}{(boat.lifecycleStatus === "SUSPENDED" || boat.lifecycleStatus === "INACTIVE") && <button className="ui-button" type="button" onClick={() => void changeLifecycle("restore")}>Restore</button>}{isAdmin && boat.lifecycleStatus !== "ARCHIVED" && <button className="ui-button profile-signout" type="button" onClick={() => void changeLifecycle("archive")}>Archive</button>}</div>
          <dl className="profile-detail-list">
            <div><dt>Boat ID</dt><dd>{boat.boatId}</dd></div>
            <div><dt>BoatNode</dt><dd>{boat.nodeId == null ? "Unassigned" : `#${boat.nodeId}`}</dd></div>
            <div><dt>Connection</dt><dd>{boat.status}</dd></div>
            <div><dt>Data source</dt><dd>{boat.dataSource}</dd></div>
            <div><dt>Last seen</dt><dd>{boat.lastSeen ? new Date(boat.lastSeen).toLocaleString() : "Unavailable"}</dd></div>
          </dl>
        </Card>
        <Card>
          <div className="section-header"><div><h2>Boat relationships</h2><p>Only persisted assignments are shown.</p></div><StatusBadge label={`${activeAssignments.length} active`} /></div>
          {activeAssignments.length === 0 ? <p className="profile-empty">No active owner, commander, crew, or family assignments.</p> : <ul className="profile-vessel-list">{activeAssignments.map((item) => <li key={`${item.userId}-${item.relationshipType}`}><div><strong>{item.relationshipType.replaceAll("_", " ")}</strong><span>User ID: {item.userId}</span></div><button className="table-action-button" type="button" onClick={() => void endAssignment(item.userId)}>End</button></li>)}</ul>}
          {assignments.some((item) => item.status !== "ACTIVE") && <div className="data-table-wrapper"><h3>Relationship history</h3><table className="data-table"><thead><tr><th>Relationship</th><th>User</th><th>Status</th><th>Started</th><th>Ended</th></tr></thead><tbody>{assignments.filter((item) => item.status !== "ACTIVE").map((item) => <tr key={`${item.userId}-${item.relationshipType}-${item.startedAt}`}><td>{item.relationshipType.replaceAll("_", " ")}</td><td>{item.userId}</td><td>{item.status}</td><td>{item.startedAt ? new Date(item.startedAt).toLocaleString() : "—"}</td><td>{item.endedAt ? new Date(item.endedAt).toLocaleString() : "—"}</td></tr>)}</tbody></table></div>}
          <form className="profile-form" onSubmit={addAssignment}><label>Account<select value={assignmentUserId} onChange={(event) => setAssignmentUserId(event.target.value)} required><option value="">Select an existing account</option>{users.filter((user) => relationshipType === "FAMILY_VIEWER" ? user.role === "FAMILY" : user.role === "FISHERMAN" || user.role === "CREW").map((user) => <option value={user.id} key={user.id}>{user.name} · {user.email}</option>)}</select></label><label>Relationship<select value={relationshipType} onChange={(event) => { setRelationshipType(event.target.value); setAssignmentUserId(""); }}><option value="OWNER">Owner</option><option value="COMMANDER">Commander</option><option value="CREW">Crew member</option><option value="FAMILY_VIEWER">Family viewer</option></select></label><button className="ui-button" type="submit">Add relationship</button></form>
        </Card>
      </section>
    </div>
  );
}
