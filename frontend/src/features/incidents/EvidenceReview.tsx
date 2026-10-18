import { AlertTriangle } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { presentAssessment, presentMediaIntegrity, type AssessmentTone } from '../../lib/assessmentPresentation';
import { REVIEW_OPTIONS, reviewPayload, reviewStatusLabel, validateReview, type EvidenceImage, type ReviewStatus } from './evidenceReviewTypes';
import { useEvidenceImage } from './useEvidenceImage';

export type { EvidenceImage, ReviewStatus };

const TONE_BOX: Record<AssessmentTone, string> = {
  review_required: 'border-warn bg-warn-tint',
  advisory: 'border-warn bg-warn-tint',
  experimental: 'border-unconfirmed bg-unconfirmed-tint',
  unavailable: 'border-control bg-canvas',
  pending: 'border-control bg-canvas',
  shadow: 'border-control bg-canvas',
};

type Props = {
  incidentId: number;
  image: EvidenceImage;
  /** Called with the server's copy after a review is saved. */
  onUpdated: (image: EvidenceImage) => void;
};

/**
 * One evidence photo: the photo itself, the (advisory) automated result, and the person's review.
 * Saving a review records a judgement of the photo only. This component never changes an incident's status.
 */
export function EvidenceReview({ incidentId, image, onUpdated }: Props) {
  const { t } = useTranslation();
  const id = useId();
  const { state, retry } = useEvidenceImage(incidentId, image.id);
  const [choice, setChoice] = useState<ReviewStatus | ''>('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const assessment = presentAssessment(image, t);
  const integrity = presentMediaIntegrity(image, t);
  const problem = validateReview(choice, note);

  async function save() {
    if (problem || !choice || saving) return;
    setSaving(true); setError(''); setSaved('');
    try {
      const result = await api<{ image: EvidenceImage }>(`/api/incidents/${incidentId}/images/${image.id}/review`, {
        method: 'PATCH',
        body: JSON.stringify(reviewPayload(choice, note)),
      });
      onUpdated(result.image);
      setSaved(`${t('ops.ev.saved', 'Saved')}: ${t(`ops.ev.status.${result.image.human_review_status}`, reviewStatusLabel(result.image.human_review_status))}.`);
      setChoice(''); setNote('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The review could not be saved. Try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="mt-4 border-t border-line pt-4 text-sm" aria-labelledby={`${id}-title`} data-testid="evidence-card">
      <p id={`${id}-title`} className="font-semibold">{image.original_filename}</p>

      <div className="mt-3">
        {state.status === 'loading' && <div className="h-48 animate-pulse rounded-rq bg-line/60" role="status" aria-label={t('ops.ev.loading', 'Loading photo')} />}
        {state.status === 'ready' && (
          <img src={state.url} alt={t('ops.ev.alt', 'Photo submitted with report {{id}}: {{name}}', { id: incidentId, name: image.original_filename })} className="max-h-80 w-full rounded-rq border border-control object-contain bg-canvas" />
        )}
        {state.status === 'error' && (
          <div role="alert" className="rounded-rq border border-control p-3">
            <p>{t('ops.ev.failed', 'The photo could not be loaded.')}</p>
            <button type="button" onClick={retry} className="mt-2 min-h-11 rounded-rq border border-control px-3 font-semibold text-action">{t('citizen.retry', 'Try again')}</button>
          </div>
        )}
      </div>

      <div className={`mt-3 rounded-rq border-l-4 p-3 ${TONE_BOX[assessment.tone]}`} data-testid="assessment-box" data-tone={assessment.tone}>
        <p className="text-ink-muted" data-testid="image-assessment">{t('ops.ev.auto', 'Automated check')}: {assessment.headline}{assessment.reason ? ` · ${assessment.reason}` : ''}</p>
        {assessment.reviewRequiredText && <p className="mt-2 flex items-start gap-2 font-semibold text-ink" data-testid="review-required"><AlertTriangle aria-hidden="true" size={18} className="mt-0.5 shrink-0" /><span>{assessment.reviewRequiredText}</span></p>}
        {assessment.experimentalOutput && <p className="mt-1 font-mono text-xs text-ink-muted" data-testid="experimental-output">{assessment.experimentalOutput}</p>}
        {assessment.detail && <p className="mt-1 text-ink-muted">{assessment.detail}</p>}
        {assessment.scores && (
          <div className="mt-2" data-testid="assessment-scores">
            <p>{t('assess.flames', 'Flames visible')}: <span className="font-semibold">{assessment.scores.flames}</span> · {t('assess.smoke', 'Smoke visible')}: <span className="font-semibold">{assessment.scores.smoke}</span></p>
            {assessment.scoresNote && <p className="text-xs text-ink-muted">{assessment.scoresNote}</p>}
          </div>
        )}
        {assessment.oodWarning && <p className="mt-2 text-warn" data-testid="assessment-ood">{assessment.oodWarning}</p>}
        {assessment.qualityWarnings.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-ink-muted" aria-label={t('assess.quality', 'Photo quality warnings')} data-testid="assessment-quality">{assessment.qualityWarnings.map(text => <li key={text}>{text}</li>)}</ul>
        )}
        {assessment.limitations.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-ink-muted" data-testid="assessment-limitations">{assessment.limitations.map(text => <li key={text}>{text}</li>)}</ul>}
        <p className="mt-1 text-xs text-ink-muted">{assessment.advisoryNote}</p>
      </div>

      <section className="mt-3 rounded-rq border border-control bg-canvas p-3" aria-label={integrity.title} data-testid="media-integrity" data-state={integrity.state}>
        <h4 className="font-semibold">{integrity.title}</h4>
        <p className="mt-1" data-testid="media-integrity-label">{integrity.label}{integrity.caveat ? ` ${integrity.caveat}` : ''}</p>
        <p className="mt-1 text-xs text-ink-muted" data-testid="media-integrity-advisory">{integrity.advisoryLine}</p>
      </section>

      <p className="mt-3" data-testid="current-review">
        <span className="font-semibold">{t('ops.ev.current', 'Current review')}: </span>{t(`ops.ev.status.${image.human_review_status}`, reviewStatusLabel(image.human_review_status))}
        {image.human_reviewed_at ? ` · ${new Date(image.human_reviewed_at).toLocaleString()}` : ''}
        {image.human_reviewed_by ? ` · ${t('ops.ev.staff', 'staff')} #${image.human_reviewed_by}` : ''}
      </p>
      {image.human_review_note && <p className="mt-1 text-ink-muted">{t('ops.close.note', 'Note')}: {image.human_review_note}</p>}

      <fieldset className="mt-4">
        <legend className="font-semibold">{t('ops.ev.judge', 'Your judgement of this photo')}</legend>
        <p className="mt-1 text-xs text-ink-muted">{t('ops.ev.judge_note', 'This records your view of the photo only. It does not change the incident\'s status.')}</p>
        <div className="mt-2 grid gap-2">
          {REVIEW_OPTIONS.map(option => (
            <label key={option.value} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-rq border border-control bg-surface p-3 has-[:checked]:border-action has-[:checked]:ring-2 has-[:checked]:ring-action">
              <input type="radio" name={`${id}-review`} value={option.value} checked={choice === option.value} onChange={() => setChoice(option.value)} className="mt-1" />
              <span><span className="font-semibold">{t(`ops.ev.opt.${option.value}`, option.label)}</span><span className="block text-xs text-ink-muted">{t(`ops.ev.opt.${option.value}_hint`, option.hint)}</span></span>
            </label>
          ))}
        </div>
        <label htmlFor={`${id}-note`} className="mt-3 block font-semibold">{t('ops.close.note', 'Note')} {choice === 'POTENTIALLY_SYNTHETIC' ? t('ops.close.required', '(required)') : t('ops.close.optional', '(optional)')}</label>
        <textarea id={`${id}-note`} value={note} onChange={event => setNote(event.target.value)} rows={3} maxLength={2000} disabled={choice === 'NOT_REVIEWED'} className="mt-1 w-full rounded-rq border border-control bg-surface p-2" />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => void save()} disabled={Boolean(problem) || saving} className="min-h-11 rounded-rq bg-action px-4 font-semibold text-on-action disabled:opacity-50">{saving ? t('ops.ev.saving', 'Saving…') : t('ops.ev.save', 'Save review')}</button>
          {choice && problem && <span className="text-xs text-ink-muted" data-testid="review-problem">{problem}</span>}
        </div>
        <div role="status" aria-live="polite" className="mt-2 min-h-5 text-action">{saved}</div>
        {error && <div role="alert" className="mt-1 text-danger">{error}</div>}
      </fieldset>
    </article>
  );
}
