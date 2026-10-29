import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { api } from '../../app/http';
import { Card, PageTitle, Skeleton } from '../../ui/Page';
import { formatWhen } from '../citizen/format';

type NoticeItem = { id: number; title: string; body: string; severity: string; expires_at: string; published_at: string | null };

/** What the public was told, so an officer on the ground is never surprised by what a caller says. */
export function FieldNoticesPage() {
  const { t } = useTranslation();
  const notices = useQuery({ queryKey: ['field-notices'], queryFn: () => api<{ items: NoticeItem[] }>('/api/notices') });
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('nav.notices', 'Notices')} subtitle={t('field.me.notices', 'What the public was told')} />
      <Card title={t('field.me.notices', 'What the public was told')}>
        {notices.isLoading ? <Skeleton lines={2} /> : !notices.data?.items.length ? <p className="text-ink-muted">{t('field.me.no_notices', 'No official notices are active.')}</p>
          : <ul className="space-y-3">{notices.data.items.map(item => <li key={item.id} className="rounded-rq border border-line p-3"><p className="font-bold">{item.title}</p><p className="mt-1 whitespace-pre-wrap">{item.body}</p><p className="mt-1 text-sm text-ink-muted">{formatWhen(item.published_at)}</p></li>)}</ul>}
      </Card>
    </div>
  );
}
