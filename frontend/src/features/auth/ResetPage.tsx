import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { completePasswordReset, SignInError } from '../../app/session';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';
import { AuthLayout } from './AuthLayout';
import { PasswordField } from './PasswordField';
import { checkPassword } from './rules';

export function ResetPage() {
  const { t } = useTranslation();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'form' | 'done' | 'invalid'>(token ? 'form' : 'invalid');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const check = checkPassword(password);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!check.ok) return;
    setBusy(true); setProblem('');
    try { await completePasswordReset(token, password); setState('done'); }
    catch (reason) { if (reason instanceof SignInError && reason.kind === 'invalid') setState('invalid'); else setProblem(reason instanceof Error ? reason.message : t('auth.network')); }
    finally { setBusy(false); }
  }

  return (
    <AuthLayout title={t('auth.reset.title')}>
      {state === 'invalid' && <><Notice kind="danger">{t('auth.reset.invalid')}</Notice><p className="mt-4 text-sm"><Link to="/forgot" className="font-semibold underline">{t('auth.forgot.submit')}</Link></p></>}
      {state === 'done' && <><Notice kind="success">{t('auth.reset.done')}</Notice><p className="mt-4"><Link to="/login" className="font-semibold underline">{t('auth.submit')}</Link></p></>}
      {state === 'form' && (
        <form onSubmit={event => void submit(event)} noValidate className="space-y-4">
          {problem && <Notice kind="danger">{problem}</Notice>}
          <PasswordField label={t('auth.reset.new')} autoComplete="new-password" hint={t('auth.register.rules')} value={password} onChange={event => setPassword(event.target.value)} />
          <Button type="submit" block loading={busy} disabled={!check.ok}>{t('auth.reset.submit')}</Button>
        </form>
      )}
    </AuthLayout>
  );
}
