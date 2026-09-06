"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { AdminPageHeader, AdminState } from "../../../components/admin/AdminPrimitives";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { AdminUser, Boat, OperatorScopeRecord, createUser, fetchBoats, fetchOperatorScope, fetchUsers, grantOperatorScope, revokeOperatorScope, setUserStatus, updateUser } from "../../../lib/api";
import { fetchCurrentUser } from "../../../lib/family/familyApi";

const roles: AdminUser["role"][] = ["FAMILY", "FISHERMAN", "CREW", "OPERATOR", "RESCUER", "ADMIN"];

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
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  useEffect(() => {
    Promise.all([fetchCurrentUser(), fetchUsers(), fetchBoats()])
      .then(([user, data, boatData]) => { setAuthorized(user?.role === "ADMIN"); setUsers(data); setBoats(boatData); })
      .catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load users."))
      .finally(() => setLoading(false));
  }, []);

  async function selectScope(user: AdminUser) { setScopeUser(user); try { setScope(await fetchOperatorScope(user.id)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to load operator scope."); } }
  async function addScope(boatId: string) { if (!scopeUser || !boatId) return; try { const record = await grantOperatorScope(scopeUser.id, boatId); setScope((current) => [...current, record]); setMessage("Operator boat access granted."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to grant operator scope."); } }
  async function removeScope(boatId: string) { if (!scopeUser || !window.confirm(`Remove ${scopeUser.name}'s access to ${boatId}?`)) return; try { await revokeOperatorScope(scopeUser.id, boatId); setScope((current) => current.map((item) => item.boatId === boatId ? { ...item, status: "ENDED" } : item)); setMessage("Operator boat access revoked."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to revoke operator scope."); } }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    try { const user = await createUser({ email: String(form.get("email")), name: String(form.get("name")), phone: String(form.get("phone") || ""), password: String(form.get("password")), role: String(form.get("role")) as AdminUser["role"], assignedBoatIds: form.getAll("boats").map(String).filter(Boolean) }); setUsers((current) => [user, ...current]); setShowForm(false); setMessage("Account created."); event.currentTarget.reset(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to create account."); }
  }
  async function changeStatus(user: AdminUser, action: "suspend" | "restore" | "archive") { if (!window.confirm(`Confirm ${action} for ${user.name}?`)) return; try { const updated = await setUserStatus(user.id, action); setUsers((current) => current.map((item) => item.id === updated.id ? updated : item)); setMessage(`Account ${action}d.`); } catch (reason) { setError(reason instanceof Error ? reason.message : `Unable to ${action} account.`); } }
  async function submitEdit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!editingUser) return; const form = new FormData(event.currentTarget); try { const updated = await updateUser(editingUser.id, { name: String(form.get("name")), email: String(form.get("email")), phone: String(form.get("phone") || ""), role: String(form.get("role")) as AdminUser["role"], authorizedBoatIds: form.getAll("boats").map(String).filter(Boolean) }); setUsers((current) => current.map((item) => item.id === updated.id ? updated : item)); setEditingUser(null); setMessage("Account updated."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Unable to update account."); } }

  const filteredUsers = useMemo(() => users.filter((user) => {
    const query = search.toLowerCase();
    const matchesQuery = !query || user.name.toLowerCase().includes(query) || user.email.toLowerCase().includes(query);
    const status = user.account_status || (user.is_active ? "ACTIVE" : "SUSPENDED");
    return matchesQuery && (roleFilter === "ALL" || user.role === roleFilter) && (statusFilter === "ALL" || status === statusFilter);
  }), [users, search, roleFilter, statusFilter]);

  if (loading) return <div className="overview-page admin-console"><AdminPageHeader title="Users" description="Provision accounts and manage their authorized lifecycle." /><AdminState title="Loading accounts" message="Retrieving current account records from the backend." /></div>;
  if (error && users.length === 0) return <div className="overview-page admin-console"><AdminPageHeader title="Users" description="Provision accounts and manage their authorized lifecycle." /><AdminState title="Unable to load users" message={error} error action={<button className="ui-button ui-button-secondary" type="button" onClick={() => window.location.reload()}>Try again</button>} /></div>;
  if (!authorized) return <div className="overview-page"><AdminState title="Access denied" message="Only administrators can manage accounts." error /></div>;

  return <div className="overview-page admin-console">
    <AdminPageHeader title="Users" description="Provision accounts and manage server-authorized access." action={<button className="ui-button" type="button" onClick={() => { setShowForm((current) => !current); setEditingUser(null); }}>{showForm ? "Close form" : "Create account"}</button>} />
    {message && <div className="admin-notice" role="status">{message}</div>}{error && <div className="admin-notice admin-notice-error" role="alert">{error}</div>}
    <div className="admin-summary-strip"><div><span>Accounts</span><strong>{users.length}</strong></div><div><span>Active</span><strong>{users.filter((user) => user.account_status === "ACTIVE" || user.is_active).length}</strong></div><div><span>Boat assignments</span><strong>{users.reduce((total, user) => total + user.authorizedBoatIds.length, 0)}</strong></div></div>
    {showForm && <Card className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">New account</p><h2>Create account</h2><p>Create a user first; vessel relationships remain separately auditable.</p></div></div><form className="admin-form" onSubmit={submit}><div className="admin-form-section"><span>Account details</span><label>Full name<input name="name" required /></label><label>Email<input name="email" type="email" required /></label><label>Phone<input name="phone" /></label><label>System role<select name="role" defaultValue="FAMILY">{roles.map((role) => <option value={role} key={role}>{role}</option>)}</select></label></div><div className="admin-form-section"><span>Provisioning</span><label>Temporary password<input name="password" type="password" minLength={8} required /></label><label>Initial boat access<select className="admin-multiselect" name="boats" multiple size={Math.min(Math.max(boats.length, 3), 6)} aria-label="Initial boat access">{boats.filter((boat) => boat.lifecycleStatus !== "ARCHIVED").map((boat) => <option key={boat.id} value={boat.boatId}>{boat.boatId}{boat.name ? ` · ${boat.name}` : ""}</option>)}</select><small className="admin-help">Hold Ctrl or Command to select multiple boats.</small></label></div><div className="admin-form-actions"><button className="ui-button" type="submit">Create account</button><button className="ui-button ui-button-secondary" type="button" onClick={() => setShowForm(false)}>Cancel</button></div></form></Card>}
    {editingUser && <Card className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">Account maintenance</p><h2>Edit {editingUser.name}</h2><p>Changes are validated and audited by the backend.</p></div></div><form className="admin-form" onSubmit={submitEdit}><div className="admin-form-section"><span>Account details</span><label>Full name<input name="name" defaultValue={editingUser.name} required /></label><label>Email<input name="email" type="email" defaultValue={editingUser.email} required /></label><label>Phone<input name="phone" defaultValue={editingUser.phone || ""} /></label><label>Role<select name="role" defaultValue={editingUser.role}>{roles.map((role) => <option value={role} key={role}>{role}</option>)}</select></label></div><div className="admin-form-section"><span>Authorized boats</span><label>Boat access<select className="admin-multiselect" name="boats" multiple size={Math.min(Math.max(boats.length, 3), 6)} defaultValue={editingUser.authorizedBoatIds} aria-label={`Authorized boats for ${editingUser.name}`}>{boats.filter((boat) => boat.lifecycleStatus !== "ARCHIVED").map((boat) => <option key={boat.id} value={boat.boatId}>{boat.boatId}{boat.name ? ` · ${boat.name}` : ""}</option>)}</select><small className="admin-help">Selections replace the current authorized boat list.</small></label></div><div className="admin-form-actions"><button className="ui-button" type="submit">Save changes</button><button className="ui-button ui-button-secondary" type="button" onClick={() => setEditingUser(null)}>Cancel</button></div></form></Card>}
    <Card className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">Directory</p><h2>Accounts</h2><p>{filteredUsers.length} of {users.length} account{users.length === 1 ? "" : "s"} shown.</p></div></div><div className="admin-toolbar"><input aria-label="Search users" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} /><select aria-label="Filter by role" value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}><option value="ALL">All roles</option>{roles.map((role) => <option key={role}>{role}</option>)}</select><select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="SUSPENDED">Suspended</option><option value="ARCHIVED">Archived</option></select></div>{filteredUsers.length === 0 ? <div className="admin-empty"><h3>No matching accounts</h3><p>No persisted users match the current filters.</p></div> : <div className="data-table-wrapper"><table className="data-table admin-table"><thead><tr><th>User</th><th>Role</th><th>Status</th><th>Assigned boats</th><th>Actions</th></tr></thead><tbody>{filteredUsers.map((user) => { const status = user.account_status || (user.is_active ? "ACTIVE" : "SUSPENDED"); return <tr key={user.id}><td><strong>{user.name}</strong><small>{user.email}</small></td><td><StatusBadge label={user.role} /></td><td><StatusBadge label={status} tone={status === "ACTIVE" ? "healthy" : status === "SUSPENDED" ? "warning" : "danger"} /></td><td><div className="admin-chip-list">{user.authorizedBoatIds.length ? user.authorizedBoatIds.map((boat) => <span className="admin-chip" key={boat}>{boat}</span>) : <span className="admin-muted">None</span>}</div></td><td><details className="admin-action-menu"><summary>Actions</summary><div><button type="button" onClick={() => setEditingUser(user)}>Edit</button>{user.role === "OPERATOR" && <button type="button" onClick={() => void selectScope(user)}>Manage scope</button>}{status === "ACTIVE" && <button type="button" onClick={() => void changeStatus(user, "suspend")}>Suspend</button>}{status === "SUSPENDED" && <button type="button" onClick={() => void changeStatus(user, "restore")}>Restore</button>}{status !== "ARCHIVED" && <button className="danger" type="button" onClick={() => void changeStatus(user, "archive")}>Archive</button>}</div></details></td></tr>; })}</tbody></table></div>}</Card></div>;
}
