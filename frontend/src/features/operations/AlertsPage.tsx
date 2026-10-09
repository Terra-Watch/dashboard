import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Alert = { id: number; kind: string; message: string; read: boolean; created_at: string };

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null); const [error, setError] = useState(''); const [reading, setReading] = useState<number | null>(null);
  useEffect(() => { api<Alert[]>('/api/alerts').then(setAlerts).catch(reason => setError(reason instanceof Error ? reason.message : 'Alerts could not be loaded.')); }, []);
  async function markRead(id: number) { setReading(id); try { await api(`/api/alerts/${id}/read`, { method: 'PATCH' }); setAlerts(items => items?.map(item => item.id === id ? { ...item, read: true } : item) || []); } catch (reason) { setError(reason instanceof Error ? reason.message : 'The alert could not be updated.'); } finally { setReading(null); } }
  return <section className="shell-page"><span className="eyebrow">Alerts</span><h1>Stay ahead of new detections.</h1><div className="filter-row"><select aria-label="Alert type"><option>All alert types</option><option>New detection</option><option>Band change</option><option>Assignment</option></select><a className="primary-link" href="/app/alerts/rules">Manage rules</a></div>{!alerts && !error && <div className="empty large" role="status">Loading alerts…</div>}{error && <div className="empty large" role="alert">{error} Check the backend connection and try again.</div>}{alerts && !alerts.length && <div className="empty large">No alerts are available. The detection feed may not be connected.</div>}{alerts?.length ? <div className="record-list">{alerts.map(alert => <article className="record-row" key={alert.id}><strong>{alert.kind}</strong><span>{alert.message}</span><time dateTime={alert.created_at}>{new Date(alert.created_at).toLocaleString()}</time>{!alert.read && <button disabled={reading === alert.id} onClick={() => void markRead(alert.id)}>{reading === alert.id ? 'Updating…' : 'Mark read'}</button>}</article>)}</div> : null}</section>;
}
