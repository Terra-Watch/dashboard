import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

type Alert = {
  id: number;
  kind: string;
  message: string;
  severity: string;
  status: string;
  read: boolean;
  state: string | null;
  created_at: string;
};

const SEVERITY_LABELS: Record<string, string> = {
  info:     'Info',
  warning:  'Warning',
  critical: 'Critical',
};

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[] | null>(null);
  const [error, setError] = useState('');
  const inFlightAlerts = useRef(new Set<number>());
  const [acting, setActing] = useState<Map<number, 'read' | 'ack' | 'resolve'>>(() => new Map());
  const [kindFilter, setKindFilter] = useState('all');
  const [feedback, setFeedback] = useState('');

  function beginAction(id: number, op: 'read' | 'ack' | 'resolve'): boolean {
    if (inFlightAlerts.current.has(id)) return false;
    inFlightAlerts.current.add(id);
    setActing(current => new Map(current).set(id, op));
    setError('');
    setFeedback('');
    return true;
  }

  function finishAction(id: number) {
    inFlightAlerts.current.delete(id);
    setActing(current => {
      const next = new Map(current);
      next.delete(id);
      return next;
    });
  }

  useEffect(() => {
    api<Alert[]>('/api/alerts')
      .then(setAlerts)
      .catch(reason =>
        setError(reason instanceof Error ? reason.message : 'Alerts could not be loaded.'),
      );
  }, []);

  async function markRead(id: number) {
    if (!beginAction(id, 'read')) return;
    try {
      await api(`/api/alerts/${id}/read`, { method: 'PATCH' });
      setAlerts(items =>
        items?.map(item => item.id === id ? { ...item, read: true } : item) || [],
      );
      setFeedback(`Alert ${id} marked as read.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The alert could not be updated.');
    } finally {
      finishAction(id);
    }
  }

  async function acknowledge(id: number) {
    if (!beginAction(id, 'ack')) return;
    try {
      const updated = await api<Alert>(`/api/alerts/${id}/acknowledge`, { method: 'PATCH' });
      setAlerts(items =>
        items?.map(item => item.id === id ? { ...item, ...updated } : item) || [],
      );
      setFeedback(`Alert ${id} acknowledged.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The alert could not be acknowledged.');
    } finally {
      finishAction(id);
    }
  }

  async function resolve(id: number) {
    if (!beginAction(id, 'resolve')) return;
    try {
      const updated = await api<Alert>(`/api/alerts/${id}/resolve`, { method: 'PATCH' });
      setAlerts(items =>
        items?.map(item => item.id === id ? { ...item, ...updated } : item) || [],
      );
      setFeedback(`Alert ${id} resolved.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The alert could not be resolved.');
    } finally {
      finishAction(id);
    }
  }

  const kinds = [...new Set(alerts?.map(alert => alert.kind) ?? [])].sort();
  const visibleAlerts =
    alerts?.filter(alert => kindFilter === 'all' || alert.kind === kindFilter) ?? [];
  const isActing = (id: number) => acting.has(id);

  return (
    <section className="shell-page">
      <span className="eyebrow">Alerts</span>
      <h1>Updates for new reports and changes.</h1>
      <div className="filter-row">
        <label>
          Show
          <select
            aria-label="Alert type"
            value={kindFilter}
            onChange={event => setKindFilter(event.target.value)}
          >
            <option value="all">All alert types</option>
            {kinds.map(kind => <option key={kind} value={kind}>{kind}</option>)}
          </select>
        </label>
        <a className="primary-link" href="/app/alerts/rules">Manage alert preferences</a>
      </div>
      {!alerts && !error && <div className="empty large" role="status">Loading alerts…</div>}
      {error && <div className="empty large" role="alert">{error}</div>}
      {feedback && <p role="status" aria-live="polite">{feedback}</p>}
      {alerts && !alerts.length && (
        <div className="empty large">No alerts are available right now.</div>
      )}
      {alerts?.length && visibleAlerts.length ? (
        <div className="record-list">
          {visibleAlerts.map(alert => (
            <article className="record-row" key={alert.id}>
              <strong>{alert.kind}</strong>
              <span>{alert.message}</span>
              <span className={`state-chip state-chip--severity-${alert.severity ?? 'info'}`}
                    aria-label={`Severity: ${SEVERITY_LABELS[alert.severity] ?? alert.severity}`}>
                {SEVERITY_LABELS[alert.severity] ?? alert.severity}
              </span>
              <span className={`state-chip state-chip--${alert.status ?? 'generated'}`}
                    aria-label={`Status: ${alert.status ?? 'generated'}`}>
                {alert.status ?? 'new'}
              </span>
              <time dateTime={alert.created_at}>{new Date(alert.created_at).toLocaleString()}</time>
              <div className="action-row">
                {!alert.read && (
                  <button
                    disabled={isActing(alert.id)}
                    onClick={() => void markRead(alert.id)}
                  >
                    {acting.get(alert.id) === 'read' ? 'Updating…' : 'Mark as read'}
                  </button>
                )}
                {alert.status === 'generated' && (
                  <button
                    disabled={isActing(alert.id)}
                    onClick={() => void acknowledge(alert.id)}
                  >
                    {acting.get(alert.id) === 'ack' ? 'Acknowledging…' : 'Acknowledge'}
                  </button>
                )}
                {(alert.status === 'generated' || alert.status === 'acknowledged') && (
                  <button
                    disabled={isActing(alert.id)}
                    onClick={() => void resolve(alert.id)}
                  >
                    {acting.get(alert.id) === 'resolve' ? 'Resolving…' : 'Resolve'}
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {alerts?.length && !visibleAlerts.length ? (
        <div className="empty large">No alerts match this type.</div>
      ) : null}
    </section>
  );
}
