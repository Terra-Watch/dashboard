"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminPageHeader, AdminState } from "../../../components/admin/AdminPrimitives";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { AdminUser, Boat, FamilyAccessRecord, fetchBoats, fetchFamilyAccess, fetchUsers, grantFamilyAccess, revokeFamilyAccess } from "../../../lib/api";

export default function FamilyAccessPage() {
  const [records, setRecords] = useState<FamilyAccessRecord[]>([]);
  const [families, setFamilies] = useState<AdminUser[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { Promise.all([fetchFamilyAccess(), fetchUsers(), fetchBoats()]).then(([access, users, boatData]) => { setRecords(access); setFamilies(users.filter((user) => user.role === "FAMILY")); setBoats(boatData); }).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load family access.")).finally(() => setLoading(false)); }, []);
  async function grant(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); try { const record = await grantFamilyAccess(String(form.get("userId")), String(form.get("boatId"))); setRecords((current) => [...current, record]); setMessage("Family access granted."); event.currentTarget.reset(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to grant access."); } }
  async function revoke(record: FamilyAccessRecord) { if (!window.confirm(`Revoke ${record.name}'s access to ${record.boatId}? The account will remain active.`)) return; try { const updated = await revokeFamilyAccess(record.userId, record.boatId); setRecords((current) => current.map((item) => item.userId === record.userId && item.boatId === record.boatId ? updated : item)); setMessage("Family access revoked."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to revoke access."); } }

  if (loading) return <div className="overview-page admin-console"><AdminPageHeader title="Family access" description="Grant and revoke vessel visibility for provisioned family accounts." /><AdminState title="Loading family access" message="Retrieving current assignments, accounts, and boats." /></div>;

  return <div className="overview-page admin-console">
    <AdminPageHeader title="Family access" description="Grant and revoke vessel visibility for provisioned family accounts." />
    {message && <div className="admin-notice" role="status">{message}</div>}
    {error && <AdminState title="Unable to load family access" message={error} error action={<button className="ui-button ui-button-secondary" type="button" onClick={() => window.location.reload()}>Try again</button>} />}
    {!error && <><Card className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">Access control</p><h2>Grant vessel visibility</h2><p>Only persisted family accounts and registered boats can be selected.</p></div></div><form className="admin-inline-form" onSubmit={grant}><label>Family account<select name="userId" required defaultValue=""><option value="" disabled>Select account</option>{families.map((user) => <option key={user.id} value={user.id}>{user.name} — {user.email}</option>)}</select></label><label>Boat<select name="boatId" required defaultValue=""><option value="" disabled>Select boat</option>{boats.map((boat) => <option key={boat.id} value={boat.boatId}>{boat.boatId}</option>)}</select></label><button className="ui-button" type="submit">Grant access</button></form></Card><Card className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">Assignments</p><h2>Family access assignments</h2><p>{records.length} persisted assignment{records.length === 1 ? "" : "s"}.</p></div></div>{records.length === 0 ? <div className="admin-empty"><h3>No family access assignments</h3><p>No family account currently has vessel access. Use Grant access above to create one.</p></div> : <div className="data-table-wrapper"><table className="data-table admin-table"><thead><tr><th>Family member</th><th>Boat</th><th>Access status</th><th>Granted</th><th>Actions</th></tr></thead><tbody>{records.map((record) => <tr key={`${record.userId}-${record.boatId}-${record.startedAt}`}><td><strong>{record.name}</strong><small>{record.email}</small></td><td><span className="admin-chip">{record.boatId}</span></td><td><StatusBadge label={record.accessStatus} tone={record.accessStatus === "ACTIVE" ? "healthy" : "warning"} /></td><td>{record.startedAt ? new Date(record.startedAt).toLocaleString() : "—"}</td><td>{record.accessStatus === "ACTIVE" && <button className="table-action-button" type="button" onClick={() => void revoke(record)}>Revoke access</button>}</td></tr>)}</tbody></table></div>}</Card></>}
  </div>;
}
