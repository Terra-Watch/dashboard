import { Eye, EyeOff } from 'lucide-react';
import { useState, type InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { TextField } from '../../ui/Field';

export function PasswordField({ label, error, hint, autoComplete, ...rest }: { label: string; error?: string | null; hint?: string; autoComplete: 'current-password' | 'new-password' } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'autoComplete'>) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <TextField label={label} error={error} hint={hint} type={shown ? 'text' : 'password'} autoComplete={autoComplete} spellCheck={false} autoCapitalize="none"
      action={<button type="button" onClick={() => setShown(value => !value)} aria-pressed={shown} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-ink underline">
        {shown ? <EyeOff aria-hidden="true" size={16} /> : <Eye aria-hidden="true" size={16} />}{shown ? t('auth.hide') : t('auth.show')}
      </button>} {...rest} />
  );
}
