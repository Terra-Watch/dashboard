import { Check, Circle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { registerCitizen } from '../../app/session';
import { Button } from '../../ui/Button';
import { TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { homePath } from '../../ui/nav';
import { AuthLayout } from './AuthLayout';
import { PasswordField } from './PasswordField';
import { checkPassword } from './rules';

export function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(false);
  const [problem, setProblem] = useState('');
  const [busy, setBusy] = useState(false);
  const check = checkPassword(password, email);
  const ready = name.trim() && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) && check.ok && consent;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!consent) { setProblem(t('auth.register.consent_needed')); return; }
    if (!ready) return;
    setBusy(true); setProblem('');
    try { await registerCitizen({ name, email, password, acceptedTerms: consent }); navigate(homePath('citizen'), { replace: true }); }
    catch (reason) { setProblem(reason instanceof Error ? reason.message : t('auth.network')); }
    finally { setBusy(false); }
  }

  const Rule = ({ ok, text }: { ok: boolean; text: string }) => <li className={`flex items-center gap-2 ${ok ? 'text-ok' : 'text-ink-muted'}`}>{ok ? <Check aria-hidden="true" size={16} /> : <Circle aria-hidden="true" size={16} />}<span>{text}{ok ? ' ✓' : ''}</span></li>;

  return (
    <AuthLayout title={t('auth.register.title')}>
      <form onSubmit={event => void submit(event)} noValidate className="space-y-4">
        {problem && <Notice kind="danger">{problem}</Notice>}
        <TextField label={t('auth.register.name')} autoComplete="name" value={name} onChange={event => setName(event.target.value)} />
        <TextField label={t('auth.email')} type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={event => setEmail(event.target.value)} />
        <PasswordField label={t('auth.password')} autoComplete="new-password" hint={t('auth.register.rules')} value={password} onChange={event => setPassword(event.target.value)} />
        {password && (
          <ul className="space-y-1 text-sm" aria-live="polite">
            <Rule ok={check.lengthOk} text="10+ characters" /><Rule ok={check.notCommon} text="Not a common password" /><Rule ok={check.notEmail} text="Does not contain your email" />
          </ul>
        )}
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} className="mt-1 size-5 accent-[var(--tw-action)]" />
          <span>{t('auth.register.consent')}</span>
        </label>
        <Button type="submit" block loading={busy} disabled={!ready}>{t('auth.register.submit')}</Button>
      </form>
      <p className="mt-6 border-t border-line pt-4 text-sm"><Link to="/login" className="font-semibold underline">{t('auth.register.have')}</Link></p>
    </AuthLayout>
  );
}
