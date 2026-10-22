import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { signIn, SignInError } from '../../app/session';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { productRole } from '../../ui/nav';
import { AuthLayout } from './AuthLayout';
import { HowItWorksAside } from './HowItWorksAside';
import { PasswordField } from './PasswordField';
import { safeNext } from './rules';

export function SignInPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) { setProblem(t('auth.required')); return; }
    setBusy(true); setProblem('');
    try {
      const user = await signIn(email, password);
      navigate(safeNext(params.get('next'), productRole(user.role)), { replace: true });
    } catch (reason) {
      const kind = reason instanceof SignInError ? reason.kind : 'other';
      setProblem(kind === 'invalid' ? t('auth.invalid') : kind === 'locked' ? t('auth.locked') : kind === 'network' ? t('auth.network') : reason instanceof Error ? reason.message : t('auth.network'));
    } finally { setBusy(false); }
  }

  return (
    <AuthLayout title={t('auth.title')} subtitle={t('auth.subtitle')} aside={<HowItWorksAside />}>
      <form onSubmit={event => void submit(event)} noValidate className="space-y-4">
        {problem && <Notice kind="danger">{problem}</Notice>}
        <TextField label={t('auth.email')} type="email" inputMode="email" autoComplete="username" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} />
        <PasswordField label={t('auth.password')} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} />
        <Button type="submit" block loading={busy}>{t('auth.submit')}</Button>
      </form>
      <div className="mt-6 space-y-3 border-t border-line pt-5">
        <Link to="/register" className="flex min-h-12 w-full items-center justify-center rounded-rq border border-control bg-surface px-4 text-base font-semibold text-ink hover:bg-surface-2">{t('auth.create')}</Link>
        <p className="text-center"><Link to="/forgot" className="inline-flex min-h-11 items-center font-semibold underline">{t('auth.forgot_link')}</Link></p>
        <details className="text-sm text-ink-muted">
          <summary className="min-h-11 cursor-pointer py-2 font-semibold text-ink">{t('citizen.v2.staff_summary', 'Are you staff?')}</summary>
          <p className="py-1">{t('auth.staffnote')}</p>
          <p><Link to="/request-access" className="inline-flex min-h-11 items-center font-semibold underline">{t('auth.access.link', 'Ask for staff access')}</Link></p>
        </details>
      </div>
    </AuthLayout>
  );
}
