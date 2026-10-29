import { Download } from 'lucide-react';
import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';
import { canInstall, install, isInstalled, isIos, subscribeInstall } from './installPrompt';

/** "Install this app" for the home screen. Shown only when the phone can install it; on iPhone it explains the two taps instead. */
export function InstallApp() {
  const { t } = useTranslation();
  const ready = useSyncExternalStore(subscribeInstall, canInstall, () => false);
  if (isInstalled()) return <p className="text-ink-muted">{t('app.installed', 'This app is installed on this phone.')}</p>;
  if (ready) return <Button variant="secondary" onClick={() => void install()} icon={<Download aria-hidden="true" size={18} />}>{t('app.install', 'Install on this phone')}</Button>;
  if (isIos()) return <p className="text-ink-muted">{t('app.install_ios', 'To install: tap Share in Safari, then Add to Home Screen.')}</p>;
  return <p className="text-ink-muted">{t('app.install_other', 'To install, open this site in Chrome or Safari on your phone and choose Install or Add to Home Screen.')}</p>;
}
