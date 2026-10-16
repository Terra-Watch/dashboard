import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { requestPasswordReset } from '../../app/session';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { AuthLayout } from './AuthLayout';

export function ForgotPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [result, setResult] = useState<'email' | 'unavailable' | null>(null);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!email.trim()) return;
    setBusy(true); setProblem('');
    try { setResult(await requestPasswordReset(email)); } catch { setProblem(t('auth.network')); } finally { setBusy(false); }
  }

  return (
    <AuthLayout title={t('auth.forgot.title')} subtitle={t('auth.forgot.body')}>
      {result ? (
        <Notice kind={result === 'email' ? 'success' : 'warning'}>{result === 'email' ? t('auth.forgot.done_email') : t('auth.forgot.done_unavailable')}</Notice>
      ) : (
        <form onSubmit={event => void submit(event)} noValidate className="space-y-4">
          {problem && <Notice kind="danger">{problem}</Notice>}
          <TextField label={t('auth.email')} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" value={email} onChange={event => setEmail(event.target.value)} />
          <Button type="submit" block loading={busy} disabled={!email.trim()}>{t('auth.forgot.submit')}</Button>
        </form>
      )}
      <p className="mt-6 border-t border-line pt-4 text-sm"><Link to="/login" className="font-semibold underline">{t('auth.forgot.back')}</Link></p>
    </AuthLayout>
  );
}
