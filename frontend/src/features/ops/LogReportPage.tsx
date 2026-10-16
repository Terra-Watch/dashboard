import { type FormEvent, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { SelectField, TextArea, TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { PageTitle } from '../../ui/Page';
import { STATES, STATE_BOUNDS, parseCoordinates } from '../citizen/format';
import { MapView } from '../map/MapView';
import { useOpsRegion } from './useOps';

const SOURCES = ['phone', 'radio', 'field_staff', 'other'];
const SIZES = ['unknown', 'small', 'medium', 'large'];

/** For a report that arrives some other way (a phone call, the radio, a colleague). It enters the queue as an unchecked report like any other. */
export function LogReportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const region = useOpsRegion();
  const clientKey = useMemo(() => crypto.randomUUID(), []);
  const [state, setState] = useState(region);
  const [source, setSource] = useState('');
  const [size, setSize] = useState('unknown');
  const [coords, setCoords] = useState('');
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const place = parseCoordinates(coords);
  const box = state ? STATE_BOUNDS[state] : null;
  const ready = Boolean(state && source && place && notes.trim().length >= 5);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !place) return;
    setBusy(true); setProblem('');
    try {
      const created = await api<{ id: number }>('/api/incidents', { method: 'POST', json: { client_key: clientKey, source, size, notes: notes.trim(), state, latitude: place.lat, longitude: place.lon, observed_at: when ? new Date(when).toISOString() : new Date().toISOString() } });
      navigate(`/ops/incidents/${created.id}`);
    } catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('auth.network')); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={event => void submit(event)} noValidate className="mx-auto max-w-3xl space-y-4">
      <PageTitle title={t('ops.log.title', 'Log a report')} subtitle={t('ops.log.sub', 'For a report that came by phone, radio or from a colleague. It joins the queue as not yet checked.')} actions={<Link to="/ops/queue" className="font-semibold underline">{t('ops.back_queue', 'Back to the queue')}</Link>} />
      {problem && <Notice kind="danger">{problem}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label={t('ops.log.state', 'State')} value={state} onChange={event => setState(event.target.value)}>
          <option value="">{t('citizen.report.choose', 'Choose')}</option>{STATES.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
        </SelectField>
        <SelectField label={t('ops.log.source', 'How it reached us')} value={source} onChange={event => setSource(event.target.value)}>
          <option value="">{t('citizen.report.choose', 'Choose')}</option>{SOURCES.map(s => <option key={s} value={s}>{t(`ops.log.src.${s}`, s.replace('_', ' '))}</option>)}
        </SelectField>
      </div>
      <TextField label={t('ops.log.coords', 'Place (latitude, longitude)')} inputMode="decimal" placeholder="20.31, 85.82" value={coords} onChange={event => setCoords(event.target.value)}
        error={coords.trim() && !place ? t('citizen.report.coords_bad', 'Write coordinates like 20.31, 85.82.') : null} hint={t('ops.log.map_hint', 'Or click the map.')} />
      <MapView label={t('ops.log.map', 'Choose the place on the map')} points={place ? [{ id: 'picked', lat: place.lat, lon: place.lon, symbol: 'report' }] : []}
        bounds={box ? [[box[0], box[1]], [box[2], box[3]]] : null} onMapClick={(lat, lon) => setCoords(`${lat.toFixed(5)}, ${lon.toFixed(5)}`)} className="h-[40vh] min-h-64" />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label={t('ops.log.size', 'Size, as described')} value={size} onChange={event => setSize(event.target.value)}>{SIZES.map(s => <option key={s} value={s}>{t(`ops.log.size.${s}`, s)}</option>)}</SelectField>
        <TextField label={t('ops.log.when', 'Seen at (leave empty for now)')} type="datetime-local" value={when} onChange={event => setWhen(event.target.value)} />
      </div>
      <TextArea label={t('ops.log.notes', 'What was reported')} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} hint={t('ops.log.notes_hint', 'Say who reported it and what they saw.')} />
      <Button type="submit" loading={busy} disabled={!ready}>{t('ops.log.submit', 'Add to the queue')}</Button>
    </form>
  );
}
