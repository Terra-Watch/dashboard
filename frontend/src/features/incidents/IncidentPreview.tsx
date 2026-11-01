import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { presentAssessment, presentMediaIntegrity } from '../../lib/assessmentPresentation';
import { RungBadge } from '../../ui/RungBadge';
import { ageText, rungOfStatus } from '../../ui/ladder';
import { formatWhen, stateName } from '../citizen/format';
import type { EvidenceImage } from './evidenceReviewTypes';
import { useEvidenceImage } from './useEvidenceImage';

type Detail = { id: number; source: string; size: string; notes: string; status: string; state: string | null; created_at: string; observed_at: string | null; images: EvidenceImage[] };

function Thumb({ incidentId, image }: { incidentId: number; image: EvidenceImage }) {
  const { t } = useTranslation();
  const { state } = useEvidenceImage(incidentId, image.id);
  if (state.status === 'ready') return <img src={state.url} alt={t('ops.preview.photo_alt', 'Photo sent with this report')} className="h-28 w-auto max-w-full rounded-lg border border-line object-cover" />;
  return <div className="flex h-28 w-36 items-center justify-center rounded-lg border border-line bg-surface-2 text-sm text-ink-muted">{state.status === 'loading' ? t('ops.preview.loading', 'Loading photo…') : t('ops.preview.photo_failed', 'Photo not available')}</div>;
}

/** What staff need at a glance when they pick a report on the map: the photos, the words, and what the evidence check says. The check is advisory; a person decides. */
type Basic = { id: number; source: string; notes: string | null; status: string; state: string | null; created_at: string; observed_at: string | null };

export function IncidentPreview({ basic }: { basic: Basic }) {
  const incidentId = basic.id;
  const { t } = useTranslation();
  const query = useQuery({ queryKey: ['incident-preview', incidentId], queryFn: () => api<Detail>(`/api/incidents/${incidentId}`), refetchInterval: 20_000 });
  const item = { ...basic, ...(query.data ?? {}), images: query.data?.images ?? [] };
  const first = item.images[0];
  const assessment = first ? presentAssessment(first, t) : null;
  const integrity = first ? presentMediaIntegrity(first, t) : null;
  return (
    <div className="space-y-3">
      <h2 className="text-xl">#{item.id} <RungBadge rung={rungOfStatus(item.status)} age={ageText(item.created_at)} /></h2>
      {item.images.length > 0 && <div className="flex flex-wrap gap-2">{item.images.slice(0, 3).map(image => <Thumb key={image.id} incidentId={item.id} image={image} />)}</div>}
      {query.isLoading && <p className="text-sm text-ink-muted">{t('ops.preview.loading_report', 'Loading photos and evidence check…')}</p>}
      {query.isError && <p role="alert" className="text-sm text-danger">{t('ops.preview.failed', 'Photos and the evidence check could not be loaded. Open the incident to see them.')}</p>}
      {query.data && item.images.length === 0 && <p className="text-sm text-ink-muted">{t('ops.preview.no_photo', 'No photo with this report.')}</p>}
      <p className="whitespace-pre-wrap">{item.notes || '—'}</p>
      <p className="text-sm text-ink-muted">{stateName(item.state)} · {t(`ops.preview.source_${item.source}`, item.source)} · {formatWhen(item.observed_at ?? item.created_at)}</p>
      {assessment && (
        <section className="rounded-rq border border-control bg-canvas p-3" aria-label={t('ops.preview.evidence', 'Evidence check')}>
          <h3 className="font-semibold">{t('ops.preview.evidence', 'Evidence check')}</h3>
          <p className="mt-1">{assessment.headline}</p>
          {integrity && <p className="mt-1 text-sm">{integrity.label}</p>}
          <p className="mt-1 text-xs text-ink-muted">{t('ops.preview.advisory', 'Advisory only. A person decides.')}</p>
        </section>
      )}
      <Link to={`/ops/incidents/${item.id}`} className="inline-flex min-h-11 items-center rounded-rq bg-action px-4 font-bold text-on-action">{t('map.open_incident', 'Open incident')}</Link>
    </div>
  );
}
