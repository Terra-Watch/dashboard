import * as Dialog from '@radix-ui/react-dialog';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { api } from '../app/http';
import { Button } from './Button';
import { inboxTarget, kindLabel, type InboxItem } from './inboxTarget';
import type { ProductRole } from './nav';
import { ageText } from './ladder';

const KEY = ['inbox'] as const;

/** The person's own notifications. Opening one marks it read and goes to the thing it is about. */
export function Inbox({ role }: { role: ProductRole }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const inbox = useQuery({ queryKey: KEY, queryFn: () => api<{ items: InboxItem[]; unread: number }>('/api/inbox'), refetchInterval: 60_000, retry: false });
  const mark = useMutation({
    mutationFn: (body: { ids?: number[]; all?: boolean }) => api('/api/inbox/read', { method: 'POST', json: body }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: KEY }),
  });
  const unread = inbox.data?.unread ?? 0;
  return (
    <Dialog.Root>
      <Dialog.Trigger aria-label={unread ? t('inbox.open_n', 'Notifications, {{n}} unread', { n: unread }) : t('inbox.open', 'Notifications')} className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-rq border border-control bg-surface text-ink hover:bg-surface-2">
        <Bell aria-hidden="true" size={18} strokeWidth={1.75} />
        {unread > 0 && <span aria-hidden="true" className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-danger px-1 text-center text-xs font-bold text-on-action">{unread > 99 ? '99+' : unread}</span>}
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <Dialog.Content data-rq-app className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-control bg-surface text-ink shadow-xl outline-none" aria-describedby={undefined}>
          <div className="flex items-center justify-between gap-3 border-b border-line p-4">
            <Dialog.Title className="text-lg font-bold">{t('inbox.title', 'Notifications')}</Dialog.Title>
            <div className="flex items-center gap-2">
              {unread > 0 && <Button variant="secondary" onClick={() => mark.mutate({ all: true })}>{t('inbox.mark_all', 'Mark all read')}</Button>}
              <Dialog.Close aria-label={t('common.close', 'Close')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-rq border border-control hover:bg-surface-2"><X aria-hidden="true" size={18} /></Dialog.Close>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {inbox.isError && <p role="alert" className="p-3">{t('inbox.error', 'Notifications could not be loaded.')}</p>}
            {inbox.data && !inbox.data.items.length && <p className="p-3 text-ink-muted">{t('inbox.empty', 'Nothing new.')}</p>}
            <ul className="space-y-1">
              {inbox.data?.items.map(item => {
                const target = inboxTarget(role, item);
                const body = (
                  <>
                    <span className="flex items-baseline justify-between gap-3"><strong>{item.read ? '' : <span className="sr-only">{t('inbox.unread', 'Unread')}: </span>}{t(`inbox.kind.${item.kind}`, kindLabel(item.kind))}</strong><span className="shrink-0 text-sm text-ink-muted">{ageText(item.created_at)}</span></span>
                    <span className="mt-0.5 block text-sm">{item.message}</span>
                  </>
                );
                const cls = `block w-full rounded-rq border p-3 text-left ${item.read ? 'border-line' : 'border-control bg-action-tint'}`;
                return (
                  <li key={item.id}>
                    {target
                      ? <Dialog.Close asChild><button type="button" className={`${cls} hover:bg-surface-2`} onClick={() => { if (!item.read) mark.mutate({ ids: [item.id] }); navigate(target); }}>{body}</button></Dialog.Close>
                      : <div className={cls}>{body}{!item.read && <button type="button" className="mt-1 min-h-11 text-sm font-semibold underline" onClick={() => mark.mutate({ ids: [item.id] })}>{t('inbox.mark_read', 'Mark read')}</button>}</div>}
                  </li>
                );
              })}
            </ul>
          </div>
          {role === 'control_room' && <div className="border-t border-line p-3"><Dialog.Close asChild><button type="button" className="min-h-11 font-semibold underline" onClick={() => navigate('/ops/alert-rules')}>{t('inbox.rules', 'Choose what notifies me')}</button></Dialog.Close></div>}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
