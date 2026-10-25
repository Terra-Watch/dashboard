import { useTranslation } from 'react-i18next';
import { ForecastSnapshot } from '../landing/ForecastSnapshot';

/** Shown beside the sign-in form: what TerraWatch is for, with the real archived forecast. */
export function SignInAside() {
  const { t } = useTranslation();
  return (
    <div className="max-w-sm space-y-6">
      <h2 className="text-3xl font-bold leading-snug">{t('landing.v3.hero_title', 'See where wildfire is most likely to start tomorrow.')}</h2>
      <ForecastSnapshot legend={false} />
      <p className="text-ink-muted">{t('auth.aside.line', 'People decide. Software only suggests.')}</p>
    </div>
  );
}
