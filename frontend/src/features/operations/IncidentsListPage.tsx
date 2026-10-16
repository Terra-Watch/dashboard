import { useEffect, useRef, useState } from 'react';
import { api, incidentImageUrl } from '../../lib/api';

type Incident = {
  id: number;
  source: string;
  size: string;
  notes: string;
  status: string;
  state: string | null;
  created_at: string;
  image_assessment_status?: string | null;
  authenticity_status?: string | null;
};

type IncidentImage = {
  id: number;
  original_filename: string;
  assessment_status: string;
  authenticity_status?: string | null;
  human_review_status: string;
  human_reviewed_by?: number | null;
  human_review_note?: string | null;
  assessment?: {
    assessment_status?: string;
    derived_label?: string | null;
    ood_flag?: boolean;
    error_code?: string | null;
  };
};

function assessmentLabel(image: IncidentImage): string {
  if (image.assessment_status === 'UNAVAILABLE') return 'Assessment unavailable';
  if (image.assessment_status === 'PENDING' || image.assessment_status === 'RUNNING') return 'Assessment pending';
  if (image.assessment?.ood_flag) return 'Uncertain · out of distribution';
  if (image.assessment?.derived_label === 'UNCERTAIN') return 'Uncertain';
  if (image.assessment_status === 'COMPLETED') return `Completed${image.assessment?.derived_label ? ` · ${image.assessment.derived_label.replace(/_/g, ' ')}` : ''}`;
  return image.assessment_status || 'Assessment pending';
}

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
  const [evidence, setEvidence] = useState<{ incidentId: number; images: IncidentImage[] } | null>(null);
  const [imageUrls, setImageUrls] = useState<Record<number, string>>({});
  const [reviewing, setReviewing] = useState<number | null>(null);
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({});

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

  async function openEvidence(incidentId: number) {
    setError('');
    try {
      const detail = await api<{ images: IncidentImage[] }>(`/api/incidents/${incidentId}`);
      setEvidence({ incidentId, images: detail.images });
      const urls = await Promise.all(detail.images.map(async image => [image.id, await incidentImageUrl(incidentId, image.id)] as const));
      setImageUrls(current => ({ ...current, ...Object.fromEntries(urls) }));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Evidence could not be loaded.');
    }
  }

  async function review(imageId: number, status: string) {
    if (!evidence) return;
    setReviewing(imageId);
    try {
      const result = await api<{ image: IncidentImage }>(`/api/incidents/${evidence.incidentId}/images/${imageId}/review`, {
        method: 'PATCH',
        body: JSON.stringify({ status, note: reviewNotes[imageId] || '' }),
      });
      setEvidence(current => current && { ...current, images: current.images.map(image => image.id === imageId ? result.image : image) });
      setFeedback(`Human review recorded for image ${imageId}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Human review could not be recorded.');
    } finally {
      setReviewing(null);
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
                {incident.image_assessment_status && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    Image Evidence Assessment: {incident.image_assessment_status === 'COMPLETED' ? 'Completed' : incident.image_assessment_status === 'UNAVAILABLE' ? 'Unavailable' : 'Pending'}
                    {incident.authenticity_status ? ` · ${incident.authenticity_status.replace(/_/g, ' ').toLowerCase()}` : ''}
                  </span>
                )}
                {incident.image_assessment_status && (
                  <button type="button" className="text-button" onClick={() => void openEvidence(incident.id)}>
                    Review evidence
                  </button>
                )}
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
      {evidence && (
        <aside className="evidence-drawer" aria-label={`Evidence for report ${evidence.incidentId}`}>
          <button type="button" className="close-sheet" onClick={() => setEvidence(null)}>Close evidence</button>
          <h2>Evidence for report {evidence.incidentId}</h2>
          <p className="muted">Automated assessment is advisory. Human review is recorded separately.</p>
          {!evidence.images.length && <p className="muted">No evidence images are attached.</p>}
          {evidence.images.map(image => (
            <article className="evidence-card" key={image.id}>
              {imageUrls[image.id] && <img src={imageUrls[image.id]} alt={`Submitted evidence: ${image.original_filename}`} />}
              <strong>{image.original_filename}</strong>
              <span className="muted">Automated: {assessmentLabel(image)}{image.authenticity_status ? ` · ${image.authenticity_status.replace(/_/g, ' ').toLowerCase()}` : ''}</span>
              {image.assessment?.error_code && <span className="muted">Reason: {image.assessment.error_code}</span>}
              <span className="muted">Human review: {image.human_review_status}{image.human_reviewed_by ? ` · reviewer ${image.human_reviewed_by}` : ''}</span>
              {image.human_review_note && <span className="muted">Note: {image.human_review_note}</span>}
              <label className="muted" htmlFor={`review-note-${image.id}`}>Review note</label>
              <textarea
                id={`review-note-${image.id}`}
                value={reviewNotes[image.id] || ''}
                onChange={event => setReviewNotes(current => ({ ...current, [image.id]: event.target.value }))}
                placeholder="Optional note for the audit trail"
                rows={2}
              />
              <div className="action-row">
                <button type="button" disabled={reviewing === image.id} onClick={() => void review(image.id, 'VERIFIED_AUTHENTIC')}>Mark authentic</button>
                <button type="button" disabled={reviewing === image.id} onClick={() => void review(image.id, 'POTENTIALLY_SYNTHETIC')}>Flag for review</button>
              </div>
            </article>
          ))}
        </aside>
      )}
    </section>
  );
}
