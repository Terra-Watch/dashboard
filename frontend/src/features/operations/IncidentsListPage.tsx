import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api';

type Incident = {
  id: number;
  source: string;
  size: string;
  notes: string;
  status: string;
  state: string | null;
  created_at: string;
};

// Must match backend PERMITTED_INCIDENT_TRANSITIONS
const TRANSITIONS: Record<string, string[]> = {
  reported:   ['verified', 'closed'],
  verified:   ['responding', 'contained', 'closed'],
  responding: ['contained', 'closed'],
  contained:  ['responding', 'closed'],
  closed:     [],
};

const STATUS_LABELS: Record<string, string> = {
  reported:   'Reported',
  verified:   'Verified',
  responding: 'Responding',
  contained:  'Contained',
  closed:     'Closed',
};

function allowedTransitions(current: string): string[] {
  return TRANSITIONS[current] ?? [];
}

export function IncidentsListPage() {
  const [incidents, setIncidents] = useState<Incident[] | null>(null);
  const [error, setError] = useState('');
  const inFlightUpdates = useRef(new Set<number>());
  const [updating, setUpdating] = useState<Set<number>>(() => new Set());
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    api<Incident[]>('/api/incidents')
      .then(setIncidents)
      .catch(reason =>
        setError(reason instanceof Error ? reason.message : 'Incidents could not be loaded.'),
      );
  }, []);

  async function update(id: number, status: string) {
    // A per-row lock prevents duplicate transitions without blocking unrelated
    // reports. The ref closes the gap before React commits the disabled state.
    if (inFlightUpdates.current.has(id)) return;
    inFlightUpdates.current.add(id);
    setUpdating(current => new Set(current).add(id));
    setError('');
    setFeedback('');
    try {
      const changed = await api<Incident>(`/api/incidents/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      setIncidents(items => items?.map(item => item.id === id ? changed : item) || []);
      setFeedback(`Report ${id} updated to ${STATUS_LABELS[changed.status] ?? changed.status}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Incident status could not be updated.');
    } finally {
      inFlightUpdates.current.delete(id);
      setUpdating(current => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
    }
  }

  return (
    <section className="shell-page">
      <span className="eyebrow">Incidents</span>
      <h1>Field reports and follow-up.</h1>
      <p className="muted">A report remains unconfirmed until a person checks it.</p>
      <a className="primary-link" href="/app/incidents/new">Create a report</a>
      {!incidents && !error && <div className="empty large">Loading reports…</div>}
      {error && <div className="empty large" role="alert">{error}</div>}
      {feedback && <p role="status" aria-live="polite">{feedback}</p>}
      {incidents && !incidents.length && (
        <div className="empty large">No reports have been submitted.</div>
      )}
      {incidents?.length ? (
        <div className="record-list">
          {incidents.map(incident => {
            const next = allowedTransitions(incident.status);
            return (
              <article className="record-row" key={incident.id}>
                <strong>Report {incident.id}</strong>
                <span>{incident.source} · {incident.size}{incident.state ? ` · ${incident.state}` : ''}</span>
                <span
                  className={`state-chip state-chip--${incident.status}`}
                  aria-label={`Status: ${STATUS_LABELS[incident.status] ?? incident.status}`}
                >
                  {STATUS_LABELS[incident.status] ?? incident.status}
                </span>
                {incident.status !== 'closed' && next.length > 0 && (
                  <select
                    aria-label={`Update report ${incident.id}`}
                    value=""
                    disabled={updating.has(incident.id)}
                    onChange={event => {
                      if (event.target.value && !inFlightUpdates.current.has(incident.id)) {
                        void update(incident.id, event.target.value);
                      }
                    }}
                  >
                    <option value="" disabled>
                      {updating.has(incident.id) ? 'Updating…' : 'Change status…'}
                    </option>
                    {next.map(s => (
                      <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>
                    ))}
                  </select>
                )}
                {incident.status === 'closed' && (
                  <span className="muted" style={{ fontSize: 12 }}>No further transitions</span>
                )}
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
