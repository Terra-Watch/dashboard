"use client";

import { useEffect, useState } from "react";
import { AuditLogEntry, fetchAuditLogs } from "../../../lib/api";
import { Card } from "../../../components/ui/Card";
import { StatusBadge } from "../../../components/ui/StatusBadge";

export default function AuditPage() {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetchAuditLogs().then(setEntries).catch((reason) => setError(reason instanceof Error ? reason.message : "Unable to load audit events.")).finally(() => setLoading(false)); }, []);
  return <div className="overview-page"><header className="overview-header"><p className="eyebrow">Administration</p><h1>Audit log</h1><p>Security-sensitive changes recorded by the backend.</p></header><Card>{loading ? <div className="family-state"><p>Loading audit events…</p></div> : error ? <div className="family-state"><p>{error}</p></div> : entries.length === 0 ? <div className="family-state"><p>No audit events recorded.</p></div> : <div className="data-table-wrapper"><table className="data-table"><thead><tr><th>Action</th><th>Target</th><th>Actor</th><th>Details</th><th>Time</th></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id}><td><StatusBadge label={entry.action} /></td><td>{entry.targetType} / {entry.targetId}</td><td>{entry.actorId || "System"}</td><td>{entry.details ? JSON.stringify(entry.details) : "—"}</td><td>{new Date(entry.createdAt).toLocaleString()}</td></tr>)}</tbody></table></div>}</Card></div>;
}
