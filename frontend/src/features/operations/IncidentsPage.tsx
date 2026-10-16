import { useState } from 'react';
import { api, uploadIncidentImage } from '../../lib/api';
import { authenticatedActorId, queueIncident } from '../../lib/offlineQueue';

const STATES = ['OD', 'CG', 'TS', 'MP', 'MH', 'JH'] as const;
const SIZES = ['small', 'moderate', 'large', 'critical'] as const;
const SOURCES = [
  { value: 'satellite', label: 'Satellite detection' },
  { value: 'patrol', label: 'Patrol' },
  { value: 'public_call', label: 'Public call' },
  { value: 'watchtower', label: 'Watchtower' },
] as const;

export function IncidentsPage() {
  // `reported` — true only after the server accepted the submission; disables the button.
  const [reported, setReported] = useState(false);
  // `queuedLocally` — counts offline-queued reports; keeps the button enabled so the
  //   user can queue multiple reports while disconnected.
  const [queuedLocally, setQueuedLocally] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [source, setSource] = useState<string>('satellite');
  const [size, setSize] = useState<string>('small');
  const [state, setState] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [assessmentMessage, setAssessmentMessage] = useState('');

  async function save() {
    if (saving || reported) return;
    setError('');
    if (!state) {
      setError('Select a state or division before saving this report.');
      return;
    }
    setSaving(true);
    const payload = { client_key: crypto.randomUUID(), source, size, notes, state };
    try {
      const created = await api<{ id: number }>('/api/incidents', { method: 'POST', body: JSON.stringify(payload) });
      setReported(true);
      if (image) {
        try {
          const result = await uploadIncidentImage<{ image: { assessment_status: string; authenticity_status?: string | null } }>(created.id, image);
          setAssessmentMessage(result.image.assessment_status === 'COMPLETED'
            ? `Image Evidence Assessment completed${result.image.authenticity_status ? `: ${result.image.authenticity_status.replace(/_/g, ' ').toLowerCase()}.` : '.'} This result is advisory and needs human review.`
            : result.image.assessment_status === 'EXPERIMENTAL'
              ? 'Image uploaded. An EXPERIMENTAL / NOT FOR OPERATIONAL USE development output was recorded for staff only; it is not an assessment. The report remains available for human review.'
              : 'Image uploaded, but automated assessment is unavailable in this environment. The report remains available for human review.');
        } catch (reason) {
          setAssessmentMessage(reason instanceof Error ? `Report saved, but the image could not be assessed: ${reason.message}` : 'Report saved, but the image could not be assessed.');
        }
      }
    } catch (reason) {
      if (reason instanceof TypeError) {
        // Fetch network failures are queued; HTTP failures and response parsing
        // errors are not misrepresented as successful local saves.
        queueIncident(payload, authenticatedActorId());
        setQueuedLocally((n) => n + 1);
      } else {
        setError(reason instanceof Error ? reason.message : 'The report could not be saved.');
      }
    } finally {
      setSaving(false);
    }
  }

  // Warn about missing state as a non-blocking hint below the form (not inside save()
  // so it never blocks the offline queue path).
  const missingState = !state;

  return (
    <section className="shell-page">
      <span className="eyebrow">Incidents</span>
      <h1>Record what the field confirms.</h1>
      <p className="muted">Use "detection" until a person verifies an incident.</p>
      <div className="form-grid">
        <label>
          State / division
          <select
            value={state}
            onChange={e => setState(e.target.value)}
            required
            aria-invalid={!!error && !state}
          >
            <option value="">— Select state —</option>
            {STATES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Source
          <select value={source} onChange={e => setSource(e.target.value)} required>
            {SOURCES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <label>
          Estimated size
          <select value={size} onChange={e => setSize(e.target.value)} required>
            {SIZES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
        </label>
        <label className="wide">
          Notes
          <textarea
            rows={3}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Access notes or field observations"
          />
        </label>
        <label className="wide">
          Evidence image (optional)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={event => {
              const next = event.target.files?.[0] ?? null;
              setImage(next);
              setImagePreview(next ? URL.createObjectURL(next) : null);
            }}
            aria-describedby="evidence-help"
          />
          <span id="evidence-help" className="muted" style={{ fontSize: 12 }}>JPEG, PNG, or WebP up to 10 MB. The assessment is advisory and never decides the incident status.</span>
        </label>
      </div>
      {imagePreview && <div className="image-preview"><img src={imagePreview} alt="Preview of selected evidence" style={{ maxWidth: 280, maxHeight: 180, objectFit: 'contain' }} /></div>}
      {missingState && !reported && (
        <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
          Select a state or division before submitting online.
        </p>
      )}
      <button disabled={saving || reported} onClick={save}>
        {saving ? 'Saving…' : 'Save as reported'}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
      {/* Online success — server accepted */}
      {reported && <div className="success-state" role="status">Incident accepted by the server as reported.</div>}
      {assessmentMessage && <div className="success-state" role="status">{assessmentMessage}</div>}
      {/* Offline success — queued locally, button stays enabled for another report */}
      {!reported && queuedLocally > 0 && (
        <div className="success-state" role="status">
          {queuedLocally === 1
            ? 'Saved locally and waiting to sync.'
            : `${queuedLocally} reports saved locally and waiting to sync.`}
        </div>
      )}
    </section>
  );
}
