import { Camera } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, OfflineError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { SelectField, TextArea } from '../../ui/Field';
import { Notice } from '../../ui/Notice';

const OUTCOMES = [
  { value: 'confirmed', label: 'Fire confirmed' }, { value: 'not_confirmed', label: 'No fire found' }, { value: 'inconclusive', label: 'Could not tell' },
] as const;

/** Record what the officer found. An observation never changes the incident: only the Control Room does that. */
export function ObservationForm({ assignmentId, onSaved }: { assignmentId: number; onSaved: () => void }) {
  const { t } = useTranslation();
  const [outcome, setOutcome] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'info' | 'danger'; text: string } | null>(null);
  const [key, setKey] = useState(() => crypto.randomUUID());
  const ready = Boolean(outcome) && notes.trim().length >= 3;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!ready) return;
    setBusy(true); setMessage(null);
    try {
      await api(`/api/ranger/assignments/${assignmentId}/verification`, { method: 'POST', json: { outcome, notes: notes.trim(), observed_at: new Date().toISOString(), idempotency_key: key }, queueIfOffline: { idempotencyKey: key } });
      setMessage({ kind: 'success', text: t('field.obs.saved', 'Saved and sent to the Control Room.') });
      setOutcome(''); setNotes(''); setKey(crypto.randomUUID()); onSaved();
    } catch (reason) {
      if (reason instanceof OfflineError && reason.queued) setMessage({ kind: 'info', text: t('field.obs.queued', 'Saved on this phone. It will be sent when you have signal.') });
      else setMessage({ kind: 'danger', text: reason instanceof ApiError ? reason.detail : t('field.obs.failed', 'Not sent. Your text is still here; try again.') });
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={event => void submit(event)} noValidate className="space-y-3">
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      <SelectField label={t('field.obs.outcome', 'What did you find?')} value={outcome} onChange={event => setOutcome(event.target.value)}>
        <option value="">{t('citizen.report.choose', 'Choose')}</option>
        {OUTCOMES.map(item => <option key={item.value} value={item.value}>{t(`field.obs.${item.value}`, item.label)}</option>)}
      </SelectField>
      <TextArea label={t('field.obs.notes', 'What you saw')} rows={4} maxLength={5000} value={notes} onChange={event => setNotes(event.target.value)} hint={t('field.obs.notes_hint', 'Size, direction, wind, access, anything that helps the Control Room.')} />
      <Button type="submit" block loading={busy} disabled={!ready}>{t('field.obs.save', 'Save observation')}</Button>
    </form>
  );
}

export function PhotoButton({ assignmentId, onDone }: { assignmentId: number; onDone: () => void }) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'success' | 'danger'; text: string } | null>(null);
  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMessage(null);
    try { const form = new FormData(); form.append('image', file); await api(`/api/ranger/assignments/${assignmentId}/evidence`, { method: 'POST', form }); setMessage({ kind: 'success', text: t('field.photo.saved', 'Photo sent.') }); onDone(); }
    catch (reason) { setMessage({ kind: 'danger', text: reason instanceof ApiError ? reason.detail : t('field.photo.failed', 'The photo was not sent. Photos need signal; try again.') }); }
    finally { setBusy(false); if (input.current) input.current.value = ''; }
  }
  return (
    <div className="space-y-2">
      {message && <Notice kind={message.kind}>{message.text}</Notice>}
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={event => void upload(event.target.files?.[0])} />
      <Button variant="secondary" block loading={busy} onClick={() => input.current?.click()} icon={<Camera aria-hidden="true" size={18} />}>{t('field.photo.take', 'Take or choose a photo')}</Button>
    </div>
  );
}
