import { useQuery } from '@tanstack/react-query';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../app/http';
import { useSession } from '../../app/session';
import { readOfflineQueue } from '../../lib/offlineQueue';
import { syncOfflineQueue } from '../../lib/offlineSync';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { Card, PageTitle } from '../../ui/Page';
import { ProfileCard } from '../../ui/ProfileCard';
import { formatWhen } from '../citizen/format';

export function MePage() {
  const { t } = useTranslation();
  const { user } = useSession();
  const [queue, setQueue] = useState(readOfflineQueue);
  const [syncing, setSyncing] = useState(false);
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api<{ configured: boolean; items: Array<{ label: string; number: string }> }>('/api/public/contacts') });

  async function sync() { setSyncing(true); try { await syncOfflineQueue(); } finally { setQueue(readOfflineQueue()); setSyncing(false); } }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('nav.me')} subtitle={user?.name} />
      <ProfileCard />
      <Card title={t('field.me.sync', 'Waiting to send')}>
        {queue.length === 0 ? <p>{t('field.me.synced', 'Everything has been sent.')}</p> : (
          <>
            <Notice kind="warning">{t('field.me.waiting', { count: queue.length, defaultValue: '{{count}} item(s) are saved on this phone and have not been sent yet.' })}</Notice>
            <ul className="mt-3 space-y-1 text-sm">{queue.map(item => <li key={item.timestamp + item.path}>{item.path.includes('verification') ? t('field.me.obs', 'Observation') : item.path.includes('reports') ? t('field.me.report', 'Report') : item.path} · {formatWhen(new Date(item.timestamp).toISOString())}</li>)}</ul>
            <Button className="mt-3" onClick={() => void sync()} loading={syncing} icon={<RefreshCw aria-hidden="true" size={18} />}>{t('field.me.send_now', 'Send now')}</Button>
          </>)}
      </Card>
      <Card title={t('field.me.contacts', 'Contacts')}>
        {contacts.data?.configured && contacts.data.items.length ? <ul className="space-y-2">{contacts.data.items.map(item => <li key={item.label + item.number}><a className="inline-flex min-h-11 items-center gap-2 font-semibold underline" href={`tel:${item.number.replace(/[^+0-9]/g, '')}`}>{item.label}: {item.number}</a></li>)}</ul> : <p className="text-ink-muted">{t('citizen.near.no_contacts', 'No numbers have been set up for this service yet. In an emergency contact your local emergency services.')}</p>}
      </Card>
    </div>
  );
}
