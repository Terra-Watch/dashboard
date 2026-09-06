"use client";

import { FormEvent, useEffect, useState } from "react";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { AdminUser, Boat, OperatorScopeRecord, createUser, fetchBoats, fetchOperatorScope, fetchUsers, grantOperatorScope, revokeOperatorScope, setUserStatus, updateUser } from "../../../lib/api";
import { fetchCurrentUser } from "../../../lib/family/familyApi";

const roles: AdminUser["role"][] = ["FAMILY", "FISHERMAN", "OPERATOR", "RESCUER", "ADMIN"];

export default function UsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [scopeUser, setScopeUser] = useState<AdminUser | null>(null);
  const [scope, setScope] = useState<OperatorScopeRecord[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([fetchCurrentUser(), fetchUsers(), fetchBoats()])
      .then(([user, data, boatData]) => { setAuthorized(user?.role === "ADMIN"); setUsers(data); setBoats(boatData); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load users."))
      .finally(() => setLoading(false));
  }, []);

  async function selectScope(user: AdminUser) {
    setScopeUser(user);
    try { setScope(await fetchOperatorScope(user.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load operator scope."); }
  }

  async function addScope(boatId: string) {
    if (!scopeUser || !boatId) return;
    try { const record = await grantOperatorScope(scopeUser.id, boatId); setScope((current) => [...current, record]); setMessage("Operator boat access granted."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to grant operator scope."); }
  }

  async function removeScope(boatId: string) {
    if (!scopeUser || !window.confirm(`Remove ${scopeUser.name}'s access to ${boatId}?`)) return;
    try { await revokeOperatorScope(scopeUser.id, boatId); setScope((current) => current.map((item) => item.boatId === boatId ? { ...item, status: "ENDED" } : item)); setMessage("Operator boat access revoked."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to revoke operator scope."); }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      const user = await createUser({ email: String(form.get("email")), name: String(form.get("name")), phone: String(form.get("phone") || ""), password: String(form.get("password")), role: String(form.get("role")) as AdminUser["role"], assignedBoatIds: String(form.get("boats") || "").split(",").map((value) => value.trim()).filter(Boolean) });
      setUsers((current) => [user, ...current]); setShowForm(false); setMessage("Account created."); event.currentTarget.reset();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create account."); }
  }

  async function changeStatus(user: AdminUser, action: "suspend" | "restore" | "archive") {
    const label = action === "suspend" ? "suspend" : action === "archive" ? "archive" : "restore";
    if (!window.confirm(`Confirm ${label} account for ${user.name}?`)) return;
    try {
      const updated = await setUserStatus(user.id, action);
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item));
      setMessage(action === "suspend" ? "Account suspended." : action === "archive" ? "Account archived." : "Account restored.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : `Unable to ${action} account.`); }
  }

  async function submitEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!editingUser) return;
    const form = new FormData(event.currentTarget);
    try {
      const updated = await updateUser(editingUser.id, { name: String(form.get("name")), email: String(form.get("email")), phone: String(form.get("phone") || ""), role: String(form.get("role")) as AdminUser["role"], authorizedBoatIds: String(form.get("boats") || "").split(",").map((value) => value.trim()).filter(Boolean) });
      setUsers((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingUser(null); setMessage("Account updated.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update account."); }
  }

  if (loading) return <div className="family-state"><p>Loading user administration…</p></div>;
  if (!authorized) return <div className="family-state"><h1>Access denied</h1><p>Only administrators can manage accounts.</p></div>;

  return <div className="overview-page">
    <header className="overview-header"><p className="eyebrow">Administration</p><h1>Users</h1><p>Provision accounts and manage their server-authorized lifecycle.</p></header>
    {message && <div className="family-inline-notice" role="status">{message}</div>}
    {error && <div className="family-inline-notice profile-error" role="alert">{error}</div>}
    <div className="profile-actions"><button className="ui-button" type="button" onClick={() => setShowForm((current) => !current)}>{showForm ? "Close form" : "Create account"}</button></div>
    {showForm && <Card className="admin-create-card"><div className="section-header"><div><h2>Create account</h2><p>System role is separate from boat relationships. Create a FISHERMAN account, then assign OWNER, COMMANDER, or CREW on a boat.</p></div></div><form className="profile-form" onSubmit={submit}><label>Full name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><label>Phone<input name="phone" /></label><label>System role<select name="role" defaultValue="FAMILY">{roles.map((role) => <option value={role} key={role}>{role}</option>)}</select></label><label>Temporary password<input name="password" type="password" minLength={8} required /></label><label>Initial family/fisherman boat access IDs<input name="boats" placeholder="Optional, comma-separated" /></label><button className="ui-button" type="submit">Create account</button></form></Card>}
    {editingUser && <Card className="admin-create-card"><div className="section-header"><div><h2>Edit account</h2><p>Role changes are audited and server-authorized.</p></div></div><form className="profile-form" onSubmit={submitEdit}><label>Full name<input name="name" defaultValue={editingUser.name} required /></label><label>Email<input name="email" type="email" defaultValue={editingUser.email} required /></label><label>Phone<input name="phone" defaultValue={editingUser.phone || ""} /></label><label>Role<select name="role" defaultValue={editingUser.role}>{roles.map((role) => <option value={role} key={role}>{role}</option>)}</select></label><label>Authorized boat IDs<input name="boats" defaultValue={editingUser.authorizedBoatIds.join(", ")} /></label><div className="profile-form-actions"><button className="ui-button" type="submit">Save account</button><button className="ui-button profile-signout" type="button" onClick={() => setEditingUser(null)}>Cancel</button></div></form></Card>}
    <Card className="admin-users-card"><div className="section-header"><div><h2>Accounts</h2><p>{users.length} account{users.length === 1 ? "" : "s"} returned by the backend.</p></div></div><div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Name</th><th>Role</th><th>Status</th><th>Boats</th><th>Actions</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.name}<small>{user.email}</small></td><td>{user.role}</td><td><StatusBadge label={user.account_status || (user.is_active ? "ACTIVE" : "SUSPENDED")} tone={user.is_active ? "healthy" : "danger"} /></td><td>{user.authorizedBoatIds.length ? user.authorizedBoatIds.join(", ") : "None"}</td><td><button className="table-action-button" type="button" onClick={() => setEditingUser(user)}>Edit</button>{user.role === "OPERATOR" && <button className="table-action-button" type="button" onClick={() => void selectScope(user)}>Scope</button>}{user.account_status === "ACTIVE" && <button className="table-action-button" type="button" onClick={() => void changeStatus(user, "suspend")}>Suspend</button>}{user.account_status === "SUSPENDED" && <button className="table-action-button" type="button" onClick={() => void changeStatus(user, "restore")}>Restore</button>}{user.account_status !== "ARCHIVED" && <button className="table-action-button" type="button" onClick={() => void changeStatus(user, "archive")}>Archive</button>}</td></tr>)}</tbody></table></div></Card>
    {scopeUser && <Card><div className="section-header"><div><h2>Operational scope: {scopeUser.name}</h2><p>Only administrators can change an operator&apos;s boat scope.</p></div><StatusBadge label={scopeUser.account_status} /></div><form className="profile-form" onSubmit={(event) => { event.preventDefault(); const form = new FormData(event.currentTarget); void addScope(String(form.get("boatId"))); event.currentTarget.reset(); }}><label>Add boat access<select name="boatId" defaultValue=""><option value="">Select boat</option>{boats.filter((boat) => !scope.some((item) => item.boatId === boat.boatId && item.status === "ACTIVE")).map((boat) => <option key={boat.id} value={boat.boatId}>{boat.boatId}</option>)}</select></label><button className="ui-button" type="submit">Grant access</button></form>{scope.length === 0 ? <p className="profile-empty">No scope records.</p> : <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Boat</th><th>Status</th><th>Started</th><th>Action</th></tr></thead><tbody>{scope.map((item) => <tr key={item.id}><td>{item.boatId}</td><td>{item.status}</td><td>{new Date(item.startedAt).toLocaleString()}</td><td>{item.status === "ACTIVE" && <button className="table-action-button" type="button" onClick={() => void removeScope(item.boatId)}>Remove</button>}</td></tr>)}</tbody></table></div>}</Card>}
  </div>;
}
