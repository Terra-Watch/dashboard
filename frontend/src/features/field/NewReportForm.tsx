import { Camera, MapPin, X } from 'lucide-react';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, OfflineError } from '../../app/http';
import { retryable, submitReport } from '../../lib/outbox';
import { Button } from '../../ui/Button';
import { SelectField, TextArea } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card } from '../../ui/Page';
import { PhotoButton } from './ObservationForm';
import { LocateButton, usePosition } from './Position';

const SIZES = [{ value: 'unknown', label: 'Not sure' }, { value: 'small', label: 'Small' }, { value: 'medium', label: 'Medium' }, { value: 'large', label: 'Large' }] as const;

/** Something found while out, with no task behind it. It reaches the Control Room as a report nobody has checked yet; only they change the incident. */
export function NewReportForm() {
  const { t } = useTranslation();
  const { position } = usePosition();
  const [notes, setNotes] = useState('');
  const [size, setSize] = useState('unknown');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'info' | 'danger'; text: string } | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const [sent, setSent] = useState<number | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [later, setLater] = useState(0);
  const [photoSummary, setPhotoSummary] = useState<{ total: number; left: number; rejected: number } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => photos.map(photo => URL.createObjectURL(photo)), [photos]);
  const ready = notes.trim().length >= 3 && position !== null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !position) return;
    setBusy(true); setMessage(null);
    try {
      const made = await submitReport('ranger', { client_key: key, notes: notes.trim(), size, latitude: position.lat, longitude: position.lon, observed_at: new Date().toISOString() }, photos);
      setLater(made.photosLeft); setPhotoSummary({ total: made.photosTotal, left: made.photosLeft, rejected: made.photosRejected }); setSent(made.id);
    } catch (reason) {
      if (retryable(reason)) { setMessage({ kind: 'info', text: t('field.new.queued', 'NOT received yet. Saved on this phone with your photos; it will send when you have signal.') + (reason instanceof ApiError ? ` ${reason.detail}` : '') }); }
      else setMessage({ kind: 'danger', text: reason instanceof ApiError ? reason.detail : t('field.new.failed', 'Not sent. Your text is still here; try again.') });
    } finally { setBusy(false); }
  }

  function again() { setSent(null); setPhotos([]); setLater(0); setNotes(''); setSize('unknown'); setKey(crypto.randomUUID()); setMessage(null); }

  if (sent !== null) {
    return (
      <div className="space-y-4">
        <Notice kind="success" title={t('field.new.sent_title', { id: sent, defaultValue: 'Received by the Control Room. Reference #{{id}}' })}>{t('field.new.sent', 'They will check it.')} {photoSummary?.total ? t('field.new.photos_up', { ok: photoSummary.total - photoSummary.left - photoSummary.rejected, total: photoSummary.total, defaultValue: '{{ok}} of {{total}} photo(s) uploaded.' }) : t('field.new.no_photo', 'No photo was sent.')}{photoSummary?.rejected ? ` ${t('field.new.photos_refused', { count: photoSummary.rejected, defaultValue: '{{count}} photo(s) were not accepted.' })}` : ''}</Notice>
        {later > 0 && <Notice kind="info">{t('field.new.photos_later', { count: later, defaultValue: '{{count}} photo(s) are saved on this phone and will send when you have signal.' })}</Notice>}
        <Card title={t('field.photo.title', 'Photo')}><PhotoButton uploadPath={`/api/ranger/reports/${sent}/evidence`} onDone={() => undefined} /></Card>
        <Button variant="secondary" block onClick={again}>{t('field.new.another', 'Report something else')}</Button>
      </div>
    );
  }

  return (
    <form onSubmit={event => void submit(event)} noValidate className="space-y-4">
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      <Card title={t('field.new.where', 'Where')}>
        <div className="flex flex-wrap items-center gap-3">
          <LocateButton />
          <span className="flex items-center gap-2 text-sm text-ink-muted"><MapPin aria-hidden="true" size={18} />{position ? t('field.new.at', { lat: position.lat.toFixed(4), lon: position.lon.toFixed(4), defaultValue: 'Your position: {{lat}}, {{lon}}' }) : t('field.new.need_position', 'Tap the button so the report has a place.')}</span>
        </div>
      </Card>
      <Card title={t('field.new.what', 'What did you find?')}>
        <div className="space-y-3">
          <TextArea label={t('field.obs.notes', 'What you saw')} rows={4} maxLength={2000} value={notes} onChange={event => setNotes(event.target.value)} hint={t('field.obs.notes_hint', 'Size, direction, wind, access, anything that helps the Control Room.')} />
          <SelectField label={t('field.new.size', 'How big is it?')} value={size} onChange={event => setSize(event.target.value)}>
            {SIZES.map(item => <option key={item.value} value={item.value}>{t(`field.new.size_${item.value}`, item.label)}</option>)}
          </SelectField>
        </div>
      </Card>
      <Card title={t('field.photo.title', 'Photo')}>
        <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" multiple hidden onChange={event => { const picked = Array.from(event.target.files ?? []); event.target.value = ''; setPhotos(current => [...current, ...picked].slice(0, 4)); }} />
        {previews.length > 0 && <ul className="mb-3 grid grid-cols-4 gap-2">{previews.map((url, index) => (
          <li key={url} className="relative overflow-hidden rounded-lg border border-line"><img src={url} alt={t('field.photo.alt', { n: index + 1, defaultValue: 'Photo {{n}}' })} className="aspect-square w-full object-cover" />
            <button type="button" onClick={() => setPhotos(current => current.filter((_, i) => i !== index))} aria-label={t('field.photo.remove', 'Remove this photo')} className="absolute right-1 top-1 flex size-8 items-center justify-center rounded-full bg-surface/90 shadow"><X aria-hidden="true" size={16} /></button></li>))}</ul>}
        {photos.length < 4 && <Button type="button" variant="secondary" block onClick={() => input.current?.click()} icon={<Camera aria-hidden="true" size={18} />}>{t('field.photo.take', 'Take or choose a photo')}</Button>}
      </Card>
      <Button type="submit" block loading={busy} disabled={!ready}>{t('field.new.send', 'Send to the Control Room')}</Button>
    </form>
  );
}
