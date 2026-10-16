import * as Dialog from '@radix-ui/react-dialog';
import { useQuery } from '@tanstack/react-query';
import { Download, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ApiError, api } from '../../app/http';
import { signOut } from '../../app/session';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { LanguageMenu } from '../../ui/LanguageMenu';
import { Notice } from '../../ui/Notice';
import { Card, PageTitle, Skeleton } from '../../ui/Page';
import { ThemeMenu } from '../../ui/ThemeMenu';
import { formatWhen } from './format';

type Account = { id: number; name: string; email: string; created_at: string; consented_at: string | null };

export function AccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const account = useQuery({ queryKey: ['account'], queryFn: () => api<{ account: Account }>('/api/citizen/account') });
  const [exporting, setExporting] = useState(false);
  const [problem, setProblem] = useState('');
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteProblem, setDeleteProblem] = useState('');

  async function exportData() {
    setExporting(true); setProblem('');
    try {
      const data = await api('/api/citizen/account/export');
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'terrawatch-my-data.json'; link.click(); URL.revokeObjectURL(url);
    } catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('citizen.account.export_failed', 'Your data could not be exported.')); }
    finally { setExporting(false); }
  }

  async function deleteAccount() {
    setDeleting(true); setDeleteProblem('');
    try { await api('/api/citizen/account', { method: 'DELETE', json: { password } }); await signOut(); navigate('/', { replace: true }); }
    catch (reason) { setDeleteProblem(reason instanceof ApiError ? reason.detail : t('citizen.account.delete_failed', 'The account was not deleted.')); }
    finally { setDeleting(false); }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageTitle title={t('nav.account')} />
      <Card title={t('citizen.account.profile', 'Your account')}>
        {account.isLoading ? <Skeleton lines={2} /> : account.data ? (
          <dl className="grid gap-3 sm:grid-cols-2">
            <div><dt className="text-sm font-bold text-ink-muted">{t('citizen.account.name', 'Name')}</dt><dd>{account.data.account.name}</dd></div>
            <div><dt className="text-sm font-bold text-ink-muted">{t('auth.email')}</dt><dd className="break-all">{account.data.account.email}</dd></div>
            <div><dt className="text-sm font-bold text-ink-muted">{t('citizen.account.joined', 'Joined')}</dt><dd>{formatWhen(account.data.account.created_at)}</dd></div>
            <div><dt className="text-sm font-bold text-ink-muted">{t('citizen.account.consent', 'Privacy notice accepted')}</dt><dd>{formatWhen(account.data.account.consented_at) || '—'}</dd></div>
          </dl>) : <Notice kind="danger">{t('citizen.account.error', 'Your account details could not be loaded.')}</Notice>}
      </Card>

      <Card title={t('citizen.account.display', 'Language and theme')}>
        <div className="flex flex-wrap items-center gap-3"><LanguageMenu /><ThemeMenu /></div>
      </Card>

      <Card title={t('citizen.account.privacy', 'Your data')}>
        <p className="text-ink-muted">{t('citizen.account.privacy_body', 'You can download everything we hold about you, or close your account. Reports already handed to staff stay as safety records without your name.')}</p>
        {problem && <Notice kind="danger" className="mt-3">{problem}</Notice>}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="secondary" loading={exporting} onClick={() => void exportData()} icon={<Download aria-hidden="true" size={18} />}>{t('citizen.account.export', 'Download my data')}</Button>
          <Dialog.Root open={open} onOpenChange={value => { setOpen(value); if (!value) { setPassword(''); setDeleteProblem(''); } }}>
            <Dialog.Trigger asChild><Button variant="danger" icon={<Trash2 aria-hidden="true" size={18} />}>{t('citizen.account.delete', 'Close my account')}</Button></Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/50" />
              <Dialog.Content data-rq-app className="fixed left-1/2 top-1/2 z-50 w-[min(92vw,28rem)] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-control bg-surface p-5 text-ink">
                <Dialog.Title className="text-xl font-bold">{t('citizen.account.delete_title', 'Close your account?')}</Dialog.Title>
                <Dialog.Description className="mt-2 text-ink-muted">{t('citizen.account.delete_body', 'You will be signed out and cannot sign in again. Your posts and chat messages are removed. This cannot be undone.')}</Dialog.Description>
                {deleteProblem && <Notice kind="danger" className="mt-3">{deleteProblem}</Notice>}
                <div className="mt-4"><TextField label={t('citizen.account.confirm_password', 'Type your password to confirm')} type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} /></div>
                <div className="mt-5 flex justify-end gap-2">
                  <Dialog.Close asChild><Button variant="secondary">{t('citizen.account.keep', 'Keep my account')}</Button></Dialog.Close>
                  <Button variant="danger" loading={deleting} disabled={!password} onClick={() => void deleteAccount()}>{t('citizen.account.delete_confirm', 'Close account')}</Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </Card>
    </div>
  );
}
