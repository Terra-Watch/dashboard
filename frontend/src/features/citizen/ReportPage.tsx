import { Camera, Check, LocateFixed, MapPin, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { ApiError, OfflineError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { SelectField, TextArea, TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { EmergencyStrip } from '../../ui/EmergencyStrip';
import { PageTitle } from '../../ui/Page';
import { MapView } from '../map/MapView';
import { STATES, STATE_BOUNDS, parseCoordinates, stateName } from './format';

const MAX_PHOTOS = 4;
type Fix = { lat: number; lon: number; accuracy?: number };

/** What the person sees, in one tap. The English text is what staff read; the label is shown in the person's language. */
const SEEN = [
  { id: 'smoke', en: 'Smoke is rising' },
  { id: 'flames', en: 'Flames are visible' },
  { id: 'both', en: 'Smoke and flames' },
  { id: 'burnt', en: 'Burnt ground, the fire may be out' },
  { id: 'unsure', en: 'Not sure what it is' },
] as const;

/** The supported state whose box contains the point; where boxes overlap, the smaller box wins. */
export function stateAt(lat: number, lon: number): string {
  const inside = Object.entries(STATE_BOUNDS).filter(([, [w, s, e, n]]) => lon >= w && lon <= e && lat >= s && lat <= n);
  inside.sort(([, a], [, b]) => (a[2] - a[0]) * (a[3] - a[1]) - (b[2] - b[0]) * (b[3] - b[1]));
  return inside[0]?.[0] ?? '';
}

/** Photo first, then one tap for what you see, the place is found for you, one button to send. Works offline for the text part. */
export function ReportPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const clientKey = useMemo(() => crypto.randomUUID(), []);
  const [coords, setCoords] = useState('');
  const [fix, setFix] = useState<Fix | null>(null);
  const [locating, setLocating] = useState(false);
  const [state, setState] = useState(() => { try { return localStorage.getItem('tw_region') ?? ''; } catch { return ''; } });
  const [seen, setSeen] = useState<(typeof SEEN)[number]['id'] | ''>('');
  const [note, setNote] = useState('');
  const [when, setWhen] = useState<'now' | 'earlier'>('now');
  const [earlier, setEarlier] = useState('');
  const [photos, setPhotos] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);
  const [manual, setManual] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => photos.map(photo => URL.createObjectURL(photo)), [photos]);
  useEffect(() => () => previews.forEach(url => URL.revokeObjectURL(url)), [previews]);

  const place = fix ?? parseCoordinates(coords);
  const box = state ? STATE_BOUNDS[state] : null;
  const coordsError = coords.trim() && !fix && !parseCoordinates(coords) ? t('citizen.report.coords_bad', 'Write coordinates like 20.31, 85.82, or use your location.') : null;
  const choice = SEEN.find(item => item.id === seen);
  const description = choice ? (note.trim() ? `${choice.en}. ${note.trim()}` : choice.en) : '';
  const ready = Boolean(place && state && description.length >= 5 && (when === 'now' || earlier));

  function locate() {
    if (!navigator.geolocation) { setManual(true); setProblem(t('citizen.report.no_gps', 'This device cannot share its location. Type the coordinates instead.')); return; }
    setLocating(true); setProblem('');
    navigator.geolocation.getCurrentPosition(
      position => {
        const next = { lat: position.coords.latitude, lon: position.coords.longitude, accuracy: position.coords.accuracy };
        setFix(next); setCoords(''); setLocating(false);
        const found = stateAt(next.lat, next.lon); if (found) setState(found);
      },
      () => { setLocating(false); setManual(true); setProblem(t('citizen.report.gps_failed', 'Could not get your location. Allow location access, or type the coordinates.')); },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  }
  // A person who opens this screen is reporting a fire: ask for the place straight away instead of making them find a button.
  useEffect(() => { locate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !place) return;
    setBusy(true); setProblem('');
    const observedAt = when === 'now' ? new Date().toISOString() : new Date(earlier).toISOString();
    try {
      const created = await api<{ report: { id: number } }>('/api/citizen/reports', { method: 'POST', json: { client_key: clientKey, latitude: place.lat, longitude: place.lon, state, description, observed_at: observedAt }, queueIfOffline: { idempotencyKey: clientKey } });
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

  const missing = [!place && t('citizen.v2.need_place', 'your place'), place && !state && t('citizen.v2.need_state', 'the state'), !choice && t('citizen.v2.need_seen', 'what you see')].filter(Boolean) as string[];

  return (
    <form onSubmit={event => void submit(event)} noValidate className="mx-auto max-w-xl space-y-6 pb-4">
      <PageTitle title={t('citizen.report.title', 'Report a fire')} subtitle={t('citizen.v2.subtitle', 'Staff check every report before anything is announced.')} />
      <EmergencyStrip />
      {problem && <Notice kind="danger">{problem}</Notice>}

      <section aria-labelledby="rp-photo" className="space-y-3">
        <h2 id="rp-photo" className="text-lg">{t('citizen.v2.photo_title', 'Take a photo')} <span className="text-base font-normal text-ink-muted">{t('citizen.v2.optional', '(helps staff, not required)')}</span></h2>
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden onChange={event => { setPhotos(current => [...current, ...Array.from(event.target.files ?? [])].slice(0, MAX_PHOTOS)); event.target.value = ''; }} />
        {previews.length > 0 && (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">{previews.map((url, index) => (
            <li key={url} className="relative overflow-hidden rounded-xl border border-line bg-surface-2">
              <img src={url} alt={t('citizen.v2.photo_alt', { n: index + 1, defaultValue: 'Photo {{n}}' })} className="aspect-square w-full object-cover" />
              <button type="button" onClick={() => setPhotos(current => current.filter((_, i) => i !== index))} aria-label={t('citizen.v2.remove_photo', 'Remove this photo')} className="absolute right-1 top-1 flex size-9 items-center justify-center rounded-full bg-surface/90 text-ink shadow"><X aria-hidden="true" size={18} /></button>
            </li>))}</ul>
        )}
        {photos.length < MAX_PHOTOS && (
          <button type="button" onClick={() => fileInput.current?.click()} className="flex w-full items-center justify-center gap-3 rounded-xl border-2 border-dashed border-control bg-surface p-5 text-lg font-semibold text-ink hover:bg-surface-2">
            <Camera aria-hidden="true" size={28} />{photos.length ? t('citizen.v2.add_more', 'Add another photo') : t('citizen.v2.open_camera', 'Open the camera')}
          </button>
        )}
      </section>

      <section aria-labelledby="rp-seen" className="space-y-3">
        <h2 id="rp-seen" className="text-lg">{t('citizen.v2.seen_title', 'What do you see?')}</h2>
        <div role="radiogroup" aria-labelledby="rp-seen" className="grid gap-2">
          {SEEN.map(item => {
            const active = seen === item.id;
            return (
              <button key={item.id} type="button" role="radio" aria-checked={active} onClick={() => setSeen(item.id)}
                className={`flex min-h-14 items-center justify-between gap-3 rounded-xl border-2 px-4 text-left text-lg font-semibold ${active ? 'border-action bg-action-tint text-ink' : 'border-line bg-surface text-ink hover:bg-surface-2'}`}>
                <span>{t(`citizen.v2.seen.${item.id}`, item.en)}</span>{active && <Check aria-hidden="true" className="shrink-0 text-action" size={24} />}
              </button>
            );
          })}
        </div>
        <TextArea label={t('citizen.v2.note', 'Anything else? (optional)')} rows={2} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} hint={t('citizen.v2.note_hint', 'How big, which direction it is spreading, a landmark.')} />
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
          <span className="font-semibold">{t('citizen.v2.when', 'When?')}</span>
          {(['now', 'earlier'] as const).map(value => <label key={value} className="flex min-h-11 items-center gap-2"><input type="radio" name="when" checked={when === value} onChange={() => setWhen(value)} className="size-5 accent-[var(--tw-action)]" />{value === 'now' ? t('citizen.report.now', 'Right now') : t('citizen.report.earlier', 'Earlier')}</label>)}
        </div>
        {when === 'earlier' && <TextField label={t('citizen.report.when', 'When did you see it?')} type="datetime-local" max={new Date().toISOString().slice(0, 16)} value={earlier} onChange={event => setEarlier(event.target.value)} />}
      </section>

      <section aria-labelledby="rp-place" className="space-y-3">
        <h2 id="rp-place" className="text-lg">{t('citizen.v2.place_title', 'Where is it?')}</h2>
        <div role="status" className={`flex items-center gap-3 rounded-xl border p-4 ${place ? 'border-ok bg-ok-tint' : 'border-line bg-surface'}`}>
          {place ? <Check aria-hidden="true" className="shrink-0 text-ok" size={24} /> : <MapPin aria-hidden="true" className="shrink-0 text-ink-muted" size={24} />}
          <div className="min-w-0">
            <p className="font-semibold">{locating ? t('citizen.v2.locating', 'Finding your place...') : place ? t('citizen.v2.place_found', 'Place found') : t('citizen.v2.place_missing', 'Place not set yet')}{state ? ` · ${stateName(state)}` : ''}</p>
            {place && <p className="text-sm text-ink-muted">{place.lat.toFixed(4)}, {place.lon.toFixed(4)}{fix?.accuracy ? ` (±${Math.round(fix.accuracy)} m)` : ''}</p>}
          </div>
          <Button variant="secondary" onClick={locate} loading={locating} icon={<LocateFixed aria-hidden="true" size={18} />} className="ml-auto shrink-0">{t('citizen.v2.locate_again', 'Use my location')}</Button>
        </div>
        <button type="button" onClick={() => setManual(value => !value)} aria-expanded={manual} className="inline-flex min-h-11 items-center font-semibold text-action underline">{manual ? t('citizen.v2.hide_manual', 'Hide the map') : t('citizen.v2.show_manual', 'The fire is somewhere else: choose on the map')}</button>
        {manual && (
          <div className="space-y-3">
            <MapView label={t('citizen.report.pick', 'Tap the map to place the pin')} points={place ? [{ id: 'pin', lat: place.lat, lon: place.lon, symbol: 'me' }] : []} bounds={place ? [[place.lon - 0.02, place.lat - 0.02], [place.lon + 0.02, place.lat + 0.02]] : box ? [[box[0], box[1]], [box[2], box[3]]] : null} onMapClick={(lat, lon) => { setFix(null); setCoords(`${lat.toFixed(5)}, ${lon.toFixed(5)}`); const found = stateAt(lat, lon); if (found) setState(found); }} className="h-64" />
            <TextField label={t('citizen.report.coords', 'Or type the coordinates')} inputMode="decimal" placeholder="20.31, 85.82" value={coords} onChange={event => { setCoords(event.target.value); setFix(null); }} error={coordsError} />
          </div>
        )}
        {(manual || (place && !state)) && (
          <SelectField label={t('citizen.report.state', 'State')} value={state} onChange={event => setState(event.target.value)}>
            <option value="">{t('citizen.report.choose', 'Choose')}</option>{STATES.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}
          </SelectField>
        )}
      </section>

      <div className="sticky bottom-20 z-20 -mx-4 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:rounded-xl md:border">
        <Button type="submit" block loading={busy} disabled={!ready} className="min-h-14 text-lg">{t('citizen.report.send', 'Send report')}</Button>
        {!ready && missing.length > 0 && <p className="mt-2 text-sm text-ink-muted">{t('citizen.v2.still_need', { items: missing.join(', '), defaultValue: 'Still needed: {{items}}.' })}</p>}
      </div>
    </form>
  );
}
