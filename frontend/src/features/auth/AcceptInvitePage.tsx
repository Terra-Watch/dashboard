import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { AuthLayout } from './AuthLayout';
import { PasswordField } from './PasswordField';
import { checkPassword } from './rules';

/** Staff set their name and password from the link an administrator sent. The link works once. */
export function AcceptInvitePage() {
  const { t } = useTranslation();
  const { token = '' } = useParams();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'form' | 'done'>('form');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const check = checkPassword(password);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!check.ok || !name.trim()) return;
    setBusy(true); setProblem('');
    try { await api(`/api/auth/invites/${encodeURIComponent(token)}/accept`, { method: 'POST', json: { name: name.trim(), password } }); setState('done'); }
    catch (reason) { setProblem(reason instanceof ApiError && reason.status === 400 ? t('auth.invite.invalid', 'This invitation is not valid any more. Ask an administrator to send a new one.') : reason instanceof Error ? reason.message : t('auth.network')); }
    finally { setBusy(false); }
  }

  return (
    <AuthLayout title={t('auth.invite.title', 'Set up your account')} subtitle={t('auth.invite.sub', 'You were invited by an administrator. Choose how you sign in.')}>
      {state === 'done'
        ? <><Notice kind="success">{t('auth.invite.done', 'Your account is ready.')}</Notice><p className="mt-4"><Link to="/login" className="font-semibold underline">{t('auth.submit')}</Link></p></>
        : (
          <form onSubmit={event => void submit(event)} noValidate className="space-y-4">
            {problem && <Notice kind="danger">{problem}</Notice>}
            <TextField label={t('auth.register.name', 'Full name')} autoComplete="name" value={name} maxLength={100} onChange={event => setName(event.target.value)} />
            <PasswordField label={t('auth.reset.new')} autoComplete="new-password" hint={t('auth.register.rules')} value={password} onChange={event => setPassword(event.target.value)} />
            <Button type="submit" block loading={busy} disabled={!check.ok || !name.trim()}>{t('auth.invite.submit', 'Create account')}</Button>
          </form>)}
    </AuthLayout>
  );
}
