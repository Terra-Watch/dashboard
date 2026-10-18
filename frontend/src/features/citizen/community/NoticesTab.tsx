import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../../app/http';
import { Notice } from '../../../ui/Notice';
import { EmptyState, Skeleton } from '../../../ui/Page';
import { formatWhen } from '../format';

export type NoticeItem = { id: number; title: string; body: string; severity: 'info' | 'advisory' | 'warning'; expires_at: string; published_at: string | null };
const TONE = { warning: 'border-danger bg-danger-tint', advisory: 'border-warn bg-warn-tint', info: 'border-action bg-action-tint' } as const;

export function NoticeList({ items }: { items: NoticeItem[] }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-3">{items.map(item => (
      <li key={item.id} className={`rounded-rq border-l-4 p-3 ${TONE[item.severity]}`}>
        <p className="text-sm font-bold uppercase tracking-wide">{t(`citizen.severity.${item.severity}`, item.severity)} · {t('citizen.community.official', 'Official')}</p>
        <h3 className="text-lg">{item.title}</h3><p className="mt-1 whitespace-pre-wrap">{item.body}</p>
        <p className="mt-2 text-sm text-ink-muted">{formatWhen(item.published_at)} · {t('citizen.near.until', 'until')} {formatWhen(item.expires_at)}</p>
      </li>))}</ul>
  );
}

export function NoticesTab() {
  const { t } = useTranslation();
  const region = (() => { try { return localStorage.getItem('tw_region') ?? ''; } catch { return ''; } })();
  const notices = useQuery({ queryKey: ['notices', region], queryFn: () => api<{ items: NoticeItem[] }>(`/api/notices${region ? `?region=${region}` : ''}`) });
  if (notices.isLoading) return <Skeleton />;
  if (notices.isError) return <Notice kind="danger">{t('citizen.near.notices_error', 'Notices could not be loaded. Try again in a moment.')}</Notice>;
  if (!notices.data?.items.length) return <EmptyState title={t('citizen.near.no_notices', 'No official notices for this area right now.')}>{t('citizen.near.no_notices_hint', 'Official notices appear here when the Control Room publishes them.')}</EmptyState>;
  return <NoticeList items={notices.data.items} />;
}
