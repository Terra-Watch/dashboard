import { Camera, LocateFixed } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ApiError, OfflineError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { SelectField, TextArea, TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { PageTitle } from '../../ui/Page';
import { MapView } from '../map/MapView';
import { STATES, STATE_BOUNDS, parseCoordinates } from './format';

const MAX_PHOTOS = 4;
type Fix = { lat: number; lon: number; accuracy?: number };

/** One short form instead of a wizard: place, what you saw, optional photos, send. Works offline for the text part. */
export function ReportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const clientKey = useMemo(() => crypto.randomUUID(), []);
  const [coords, setCoords] = useState('');
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [state, setState] = useState(() => { try { return localStorage.getItem('tw_region') ?? ''; } catch { return ''; } });
  const [when, setWhen] = useState<'now' | 'earlier'>('now');
  const [earlier, setEarlier] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const place = fix ?? parseCoordinates(coords);
  const box = state ? STATE_BOUNDS[state] : null;
  const coordsError = coords.trim() && !fix && !parseCoordinates(coords) ? t('citizen.report.coords_bad', 'Write coordinates like 20.31, 85.82, or use your location.') : null;
  const ready = Boolean(place && state && description.trim().length >= 5 && (when === 'now' || earlier));

  function locate() {
    if (!navigator.geolocation) { setProblem(t('citizen.report.no_gps', 'This device cannot share its location. Type the coordinates instead.')); return; }
    setLocating(true); setProblem('');
    navigator.geolocation.getCurrentPosition(
      position => { setFix({ lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy }); setCoords(''); setLocating(false); },
      () => { setLocating(false); setProblem(t('citizen.report.gps_failed', 'Could not get your location. Allow location access, or type the coordinates.')); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !place) return;
    setBusy(true); setProblem('');
    const observedAt = when === 'now' ? new Date().toISOString() : new Date(earlier).toISOString();
    try {
      const created = await api<{ report: { id: number } }>('/api/citizen/reports', { method: 'POST', json: { client_key: clientKey, latitude: place.lat, longitude: place.lon, state, description: description.trim(), observed_at: observedAt }, queueIfOffline: { idempotencyKey: clientKey } });
      let failed = 0;
      for (const photo of photos) {
        const form = new FormData(); form.append('image', photo);
        try { await api(`/api/citizen/reports/${created.report.id}/evidence`, { method: 'POST', form }); } catch { failed += 1; }
      }
      navigate(`/citizen/reports/${created.report.id}`, { replace: true, state: { sent: true, photosFailed: failed } });
    } catch (reason) {
      if (reason instanceof OfflineError) { if (reason.queued) setSaved(true); else setProblem(t('citizen.report.offline', 'You are offline. Check your connection and try again.')); }
      else setProblem(reason instanceof ApiError ? reason.detail : t('citizen.report.failed', 'The report was not sent. Nothing was lost; try again.'));
    } finally { setBusy(false); }
  }

  if (saved) return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageTitle title={t('citizen.report.saved_title', 'Saved on this phone')} />
      <Notice kind="info">{t('citizen.report.saved', 'You are offline, so your report is saved here and will be sent when the connection returns. Photos are not saved offline: add them from My reports afterwards.')}</Notice>
      <Link to="/citizen/reports" className="inline-flex min-h-11 items-center font-semibold underline">{t('nav.my_reports')}</Link>
    </div>
  );

  return (
    <form onSubmit={event => void submit(event)} noValidate className="mx-auto max-w-xl space-y-5">
      <PageTitle title={t('citizen.report.title', 'Report a fire')} subtitle={t('citizen.report.subtitle', 'Tell us what you saw. Staff will check it before anything is announced.')} />
      <Notice kind="warning">{t('landing.hero.emergency')}</Notice>
      {problem && <Notice kind="danger">{problem}</Notice>}

      <fieldset className="space-y-3 rounded-panel border border-line bg-surface p-4">
        <legend className="px-1 text-lg font-bold">{t('citizen.report.where', '1. Where is it?')}</legend>
        <Button variant="secondary" onClick={locate} loading={locating} icon={<LocateFixed aria-hidden="true" size={18} />}>{t('citizen.report.use_location', 'Use my location')}</Button>
        {fix && <p role="status" className="text-sm">{t('citizen.report.fixed', 'Using your location')}: {fix.lat.toFixed(5)}, {fix.lon.toFixed(5)}{fix.accuracy ? ` (±${Math.round(fix.accuracy)} m)` : ''}. <button type="button" className="underline" onClick={() => setFix(null)}>{t('citizen.report.change', 'Change')}</button></p>}
        <MapView label={t('citizen.report.pick', 'Tap the map to place the pin')} points={place ? [{ id: 'pin', lat: place.lat, lon: place.lon, symbol: 'me' }] : []} bounds={place ? [[place.lon - 0.02, place.lat - 0.02], [place.lon + 0.02, place.lat + 0.02]] : box ? [[box[0], box[1]], [box[2], box[3]]] : null} onMapClick={(lat, lon) => { setFix(null); setCoords(`${lat.toFixed(5)}, ${lon.toFixed(5)}`); }} className="h-64" />
        <p className="text-sm text-ink-muted">{t('citizen.report.pick_hint', 'Tap the map to place the pin, or use your location. Only staff who handle the report can see the exact place.')}</p>
        {!fix && <TextField label={t('citizen.report.coords', 'Or type the coordinates')} inputMode="decimal" placeholder="20.31, 85.82" value={coords} onChange={event => setCoords(event.target.value)} error={coordsError} hint={t('citizen.report.coords_hint', 'Latitude, longitude. The pin above fills this in.')} />}
        <SelectField label={t('citizen.report.state', 'State')} value={state} onChange={event => setState(event.target.value)}>
          <option value="">{t('citizen.report.choose', 'Choose')}</option>{STATES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
        </SelectField>
      </fieldset>

      <fieldset className="space-y-3 rounded-panel border border-line bg-surface p-4">
        <legend className="px-1 text-lg font-bold">{t('citizen.report.what', '2. What did you see?')}</legend>
        <div className="flex flex-wrap gap-4">
          {(['now', 'earlier'] as const).map(value => <label key={value} className="flex min-h-11 items-center gap-2"><input type="radio" name="when" checked={when === value} onChange={() => setWhen(value)} className="size-5 accent-[var(--tw-action)]" />{value === 'now' ? t('citizen.report.now', 'Seen just now') : t('citizen.report.earlier', 'Seen earlier')}</label>)}
        </div>
        {when === 'earlier' && <TextField label={t('citizen.report.when', 'When did you see it?')} type="datetime-local" max={new Date().toISOString().slice(0, 16)} value={earlier} onChange={event => setEarlier(event.target.value)} />}
        <TextArea label={t('citizen.report.describe', 'Describe it')} rows={4} maxLength={5000} value={description} onChange={event => setDescription(event.target.value)} hint={t('citizen.report.describe_hint', 'Smoke or flames, how big, which direction, anything near it. Do not include phone numbers.')} />
      </fieldset>

      <fieldset className="space-y-3 rounded-panel border border-line bg-surface p-4">
        <legend className="px-1 text-lg font-bold">{t('citizen.report.photos', '3. Photos (optional)')}</legend>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden onChange={event => setPhotos(current => [...current, ...Array.from(event.target.files ?? [])].slice(0, MAX_PHOTOS))} />
        <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={photos.length >= MAX_PHOTOS} icon={<Camera aria-hidden="true" size={18} />}>{t('citizen.report.add_photo', 'Add a photo')}</Button>
        {photos.length > 0 && <ul className="space-y-1 text-sm">{photos.map((photo, index) => <li key={photo.name + index} className="flex items-center justify-between gap-2"><span className="truncate">{photo.name}</span><button type="button" className="min-h-11 underline" onClick={() => setPhotos(current => current.filter((_, i) => i !== index))}>{t('citizen.report.remove', 'Remove')}</button></li>)}</ul>}
        <p className="text-sm text-ink-muted">{t('citizen.report.photo_note', { max: MAX_PHOTOS, defaultValue: 'Up to {{max}} photos. Only staff who handle this report can see them.' })}</p>
      </fieldset>

      <Button type="submit" block loading={busy} disabled={!ready}>{t('citizen.report.send', 'Send report')}</Button>
      {!ready && <p className="text-sm text-ink-muted">{t('citizen.report.needs', 'To send: add a place, choose the state and describe what you saw (at least 5 characters).')}</p>}
    </form>
  );
}
