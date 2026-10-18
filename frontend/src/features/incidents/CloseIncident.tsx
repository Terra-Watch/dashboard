import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CLOSE_REASONS, validateClosure, type CloseReason } from './closure';

type Props = { incidentId: number; busy: boolean; onConfirm: (reason: CloseReason, note: string) => void; onCancel: () => void };

export function CloseIncident({ incidentId, busy, onConfirm, onCancel }: Props) {
  const { t } = useTranslation();
  const [reason, setReason] = useState<CloseReason | ''>('');
  const [note, setNote] = useState('');
  const problem = validateClosure(reason, note);
  return (
    <form data-testid="close-incident" aria-labelledby="close-title" className="mt-4 w-full rounded-rq border border-control bg-surface p-4"
      onSubmit={event => { event.preventDefault(); if (!problem && reason) onConfirm(reason, note); }}>
      <h3 id="close-title" className="font-serif text-lg">{t('ops.close.title', 'Close incident {{id}}', { id: incidentId })}</h3>
      <p className="mt-1 text-sm text-ink-muted">{t('ops.close.final', 'Closing is final. The reporter will see the reason.')}</p>
      <fieldset className="mt-3">
        <legend className="text-sm font-semibold">{t('ops.close.reason', 'Reason')}</legend>
        {CLOSE_REASONS.map(item => (
          <label key={item.value} className="mt-2 flex items-start gap-2 text-sm">
            <input type="radio" name="close-reason" value={item.value} checked={reason === item.value} onChange={() => setReason(item.value)} className="mt-1" />
            <span><span className="font-semibold">{t(`ops.close.${item.value}`, item.label)}</span><span className="block text-ink-muted">{t(`ops.close.${item.value}_hint`, item.hint)}</span></span>
          </label>
        ))}
      </fieldset>
      <label htmlFor="close-note" className="mt-3 block text-sm font-semibold">{t('ops.close.note', 'Note')} {reason === 'other' ? t('ops.close.required', '(required)') : t('ops.close.optional', '(optional)')}</label>
      <textarea id="close-note" value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={2000} className="mt-1 w-full rounded-rq border border-control bg-canvas px-3 py-2 text-sm" />
      <p data-testid="close-problem" role="status" className="mt-2 min-h-5 text-sm text-ink-muted">{reason ? problem : ''}</p>
      <div className="mt-2 flex gap-2">
        <button type="submit" disabled={busy || Boolean(problem)} className="min-h-11 rounded-rq border border-danger bg-danger px-4 py-2 text-sm font-semibold text-on-action disabled:opacity-50">{busy ? t('ops.close.closing', 'Closing…') : t('ops.close.confirm', 'Close incident')}</button>
        <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 rounded-rq border border-control px-4 py-2 text-sm font-semibold">{t('ops.close.keep', 'Keep open')}</button>
      </div>
    </form>
  );
}
