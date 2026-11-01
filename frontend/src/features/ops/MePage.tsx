import { useTranslation } from 'react-i18next';
import { Card, PageTitle } from '../../ui/Page';
import { PushToggle } from '../citizen/PushToggle';
import { ProfileCard } from '../../ui/ProfileCard';

/** The Control Room operator's own page. Region and shift tools stay on the queue; this is who you are and how the app behaves for you. */
export function OpsMePage() {
  const { t } = useTranslation();
  return <div className="mx-auto max-w-2xl space-y-4"><PageTitle title={t('nav.me', 'Me')} /><ProfileCard /><Card title={t('staff.push.title', 'Alerts on this device')}><PushToggle staff /></Card></div>;
}
