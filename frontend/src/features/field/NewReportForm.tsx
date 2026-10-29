import { MapPin } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, OfflineError, api } from '../../app/http';
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
  const ready = notes.trim().length >= 3 && position !== null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready || !position) return;
    setBusy(true); setMessage(null);
    try {
      const made = await api<{ id: number }>('/api/ranger/reports', { method: 'POST', json: { client_key: key, notes: notes.trim(), size, latitude: position.lat, longitude: position.lon, observed_at: new Date().toISOString() }, queueIfOffline: { idempotencyKey: key } });
      setSent(made.id);
    } catch (reason) {
      if (reason instanceof OfflineError && reason.queued) { setMessage({ kind: 'info', text: t('field.new.queued', 'Saved on this phone. It will be sent when you have signal. A photo can only be added once it has been sent.') }); setNotes(''); setKey(crypto.randomUUID()); }
      else setMessage({ kind: 'danger', text: reason instanceof ApiError ? reason.detail : t('field.new.failed', 'Not sent. Your text is still here; try again.') });
    } finally { setBusy(false); }
  }

  function again() { setSent(null); setNotes(''); setSize('unknown'); setKey(crypto.randomUUID()); setMessage(null); }

  if (sent !== null) {
    return (
      <div className="space-y-4">
        <Notice kind="success">{t('field.new.sent', 'Sent to the Control Room. They will check it.')}</Notice>
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
      <Button type="submit" block loading={busy} disabled={!ready}>{t('field.new.send', 'Send to the Control Room')}</Button>
    </form>
  );
}
