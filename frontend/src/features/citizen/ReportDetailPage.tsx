import { shrinkPhoto } from '../../lib/photo';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useParams } from 'react-router';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { Card, PageTitle, Skeleton } from '../../ui/Page';
import { Notice } from '../../ui/Notice';
import { RungBadge } from '../../ui/RungBadge';
import { rungOfStatus } from '../../ui/ladder';
import { OwnPhoto } from './OwnPhoto';
import { formatWhen, stateName } from './format';

type Report = { id: number; status: string; close_reason: string | null; state: string; latitude: number; longitude: number; observed_at: string; created_at: string; evidence: Array<{ id: number; original_filename: string; waiting_for_check?: boolean }> };
type Event = { kind: string; at: string; close_reason?: string | null };

const REASONS: Record<string, string> = { resolved: 'The fire was dealt with.', false_alarm: 'It turned out not to be a fire.', duplicate: 'Another report already covered it.', unable_to_verify: 'Staff could not confirm it.', other: 'Closed by staff.' };

export function ReportDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams();
  const location = useLocation();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [problem, setProblem] = useState('');
  const state = (location.state ?? {}) as { sent?: boolean; photosTotal?: number; photosLeft?: number; photosRejected?: number };
  const report = useQuery({ queryKey: ['my-report', id], queryFn: () => api<{ report: Report }>(`/api/citizen/reports/${id}`), refetchInterval: query => (query.state.data?.report.status === 'closed' ? false : 15_000) });
  const timeline = useQuery({ queryKey: ['my-report-timeline', id], queryFn: () => api<{ items: Event[] }>(`/api/citizen/reports/${id}/timeline`) });

  async function addPhoto(file: File | undefined) {
    if (!file) return;
    setUploading(true); setProblem('');
    try { const form = new FormData(); form.append('image', await shrinkPhoto(file)); await api(`/api/citizen/reports/${id}/evidence`, { method: 'POST', form }); await queryClient.invalidateQueries({ queryKey: ['my-report', id] }); }
    catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('citizen.detail.photo_failed', 'The photo was not added. Try again.')); }
    finally { setUploading(false); }
  }

  if (report.isLoading) return <div className="mx-auto max-w-2xl"><Skeleton lines={5} /></div>;
  if (report.isError || !report.data) return <div className="mx-auto max-w-2xl"><Notice kind="danger">{t('citizen.detail.missing', 'That report was not found.')} <Link className="underline" to="/citizen/reports">{t('nav.my_reports')}</Link></Notice></div>;
  const item = report.data.report;
  const rung = rungOfStatus(item.status);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('citizen.reports.number', { id: item.id, defaultValue: 'Report {{id}}' })} subtitle={`${stateName(item.state)} · ${formatWhen(item.created_at)}`} actions={<RungBadge rung={rung} />} />
      {state.sent && (
        <Notice kind="success" title={t('citizen.detail.received_title', { id: item.id, defaultValue: 'Report received. Reference #{{id}}' })}>
          {t('citizen.detail.sent', 'Staff will check it. You will see each step here.')}
          {' '}
          {!state.photosTotal ? t('citizen.detail.no_photos_sent', 'You sent no photo.')
            : t('citizen.detail.photos_up', { ok: item.evidence.length, total: state.photosTotal, defaultValue: '{{ok}} of {{total}} photo(s) uploaded.' })}
          {state.photosLeft ? ` ${t('citizen.detail.photos_waiting', { count: state.photosLeft, defaultValue: '{{count}} photo(s) are saved on your phone and will upload when you have signal.' })}` : ''}
          {state.photosRejected ? ` ${t('citizen.detail.photos_refused', { count: state.photosRejected, defaultValue: '{{count}} photo(s) were not accepted (wrong type or too large). Add them again below.' })}` : ''}
        </Notice>
      )}
      {item.status === 'closed' && <Notice kind="info" title={t('citizen.detail.closed', 'This report is closed')}>{REASONS[item.close_reason ?? 'other']}</Notice>}
      {problem && <Notice kind="danger">{problem}</Notice>}

      <Card title={t('citizen.detail.what_happened', 'What has happened')}>
        {timeline.isLoading ? <Skeleton lines={3} /> : (
          <ol className="relative space-y-4 border-l-2 border-line pl-5">
            {timeline.data?.items.map((event, index) => (
              <li key={event.kind + event.at + index} className="relative">
                <span aria-hidden="true" className="absolute -left-[1.65rem] top-1 size-3 rounded-full border-2 border-surface bg-action" />
                <p className="font-bold">{event.kind === 'received' ? t('citizen.detail.received', 'Received') : <RungBadge rung={rungOfStatus(event.kind)} />}</p>
                <p className="text-sm text-ink-muted">{formatWhen(event.at)}{event.kind === 'closed' && event.close_reason ? ` · ${REASONS[event.close_reason] ?? ''}` : ''}</p>
              </li>))}
          </ol>)}
      </Card>

      <Card title={t('citizen.detail.photos', 'Photos')}>
        {item.evidence.length ? <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">{item.evidence.map(photo => <li key={photo.id}><OwnPhoto reportId={item.id} imageId={photo.id} className="aspect-square w-full" />{photo.waiting_for_check && <p className="mt-1 text-sm text-ink-muted">{t('citizen.photo.waiting', 'Officials will check this photo before others can see it.')}</p>}</li>)}</ul> : <p className="text-ink-muted">{t('citizen.detail.no_photos', 'No photos added.')}</p>}
        {item.status !== 'closed' && <><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={event => void addPhoto(event.target.files?.[0])} />
          <Button className="mt-3" variant="secondary" loading={uploading} onClick={() => fileInput.current?.click()} icon={<Camera aria-hidden="true" size={18} />}>{t('citizen.report.add_photo', 'Add a photo')}</Button></>}
      </Card>
    </div>
  );
}
