"use client";

import { useEffect, useState } from "react";
import { AdminPageHeader, AdminState } from "../../../components/admin/AdminPrimitives";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";
import { AuditLogEntry, fetchAuditLogs } from "../../../lib/api";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatKey(key: string) {
  return key.replaceAll(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ");
}

function AuditDetails({ details }: { details?: Record<string, unknown> | null }) {
  if (!details || Object.keys(details).length === 0) return <span className="admin-muted">—</span>;
  return <div className="admin-detail-list">{Object.entries(details).map(([key, value]) => <span key={key}><strong>{formatKey(key)}</strong><em>{typeof value === "object" ? JSON.stringify(value) : String(value)}</em></span>)}</div>;
}

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { fetchAuditLogs().then(setEntries).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load audit events.")).finally(() => setLoading(false)); }, []);

  return <div className="overview-page admin-console">
    <AdminPageHeader title="Audit log" description="Security-sensitive changes recorded by the backend." />
    {loading ? <AdminState title="Loading audit events" message="Retrieving the latest persisted audit records." /> : error ? <AdminState title="Unable to load audit log" message={error} error action={<button className="ui-button ui-button-secondary" type="button" onClick={() => window.location.reload()}>Try again</button>} /> : <Card className="admin-panel"><div className="admin-panel-heading"><div><p className="admin-kicker">Immutable activity</p><h2>Recent audit events</h2><p>{entries.length} persisted event{entries.length === 1 ? "" : "s"} returned by the backend.</p></div></div>{entries.length === 0 ? <div className="admin-empty"><h3>No audit events recorded</h3><p>Security-sensitive account and access changes will appear here.</p></div> : <div className="data-table-wrapper"><table className="data-table admin-table admin-audit-table"><thead><tr><th>Action</th><th>Target</th><th>Actor</th><th>Details</th><th>Time</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td><StatusBadge label={entry.action} /></td><td><strong>{entry.targetType}</strong><small>{entry.targetId}</small></td><td>{entry.actorId || "System"}</td><td><AuditDetails details={entry.details} /></td><td className="admin-nowrap">{formatDate(entry.createdAt)}</td></tr>)}</tbody></table></div>}</Card>}
  </div>;
}
