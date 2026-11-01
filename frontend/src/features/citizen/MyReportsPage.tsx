import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { EmptyState, PageTitle, Skeleton } from '../../ui/Page';
import { Notice } from '../../ui/Notice';
import { RungBadge } from '../../ui/RungBadge';
import { rungOfStatus } from '../../ui/ladder';
import { OwnPhoto } from './OwnPhoto';
import { formatWhen, stateName } from './format';

type Row = { id: number; status: string; close_reason: string | null; state: string; created_at: string; updated_at: string; photo_count?: number; first_photo_id?: number | null };

export function MyReportsPage() {
  const { t } = useTranslation();
  const reports = useQuery({ queryKey: ['my-reports'], queryFn: () => api<{ items: Row[] }>('/api/citizen/reports'), refetchInterval: 30_000 });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('nav.my_reports')} subtitle={t('citizen.reports.subtitle', 'Follow each report from received to closed.')} />
      {reports.isLoading ? <Skeleton lines={4} /> : reports.isError ? <Notice kind="danger">{t('citizen.reports.error', 'Your reports could not be loaded.')} <button className="underline" onClick={() => void reports.refetch()}>{t('citizen.retry', 'Try again')}</button></Notice>
        : !reports.data?.items.length ? <EmptyState title={t('citizen.reports.empty', 'You have not sent a report yet.')} action={<Link to="/citizen/report" className="inline-flex min-h-11 items-center rounded-rq bg-action px-5 font-bold text-on-action">{t('nav.report')}</Link>}>{t('citizen.reports.empty_hint', 'Reports you send appear here with every step.')}</EmptyState>
        : <ul className="space-y-3">{reports.data.items.map(item => (
            <li key={item.id}><Link to={`/citizen/reports/${item.id}`} className="block rounded-panel border border-line bg-surface p-4 text-ink hover:bg-surface-2">
              <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-lg font-bold">{t('citizen.reports.number', { id: item.id, defaultValue: 'Report {{id}}' })}</span><RungBadge rung={rungOfStatus(item.status)} /></div>
              <p className="mt-1 text-sm text-ink-muted">{stateName(item.state)} · {formatWhen(item.created_at)}</p>
              <div className="mt-2 flex items-center gap-3">
                {item.first_photo_id ? <OwnPhoto reportId={item.id} imageId={item.first_photo_id} className="size-16" /> : null}
                <span className="text-sm">{item.photo_count ? t('citizen.reports.photos', { count: item.photo_count, defaultValue: '{{count}} photo(s) received' }) : t('citizen.reports.no_photos', 'No photo with this report')}</span>
              </div>
            </Link></li>))}</ul>}
    </div>
  );
}
