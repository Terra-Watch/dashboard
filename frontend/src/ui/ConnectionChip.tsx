import { Wifi, WifiOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/** Online/offline state in words and an icon, plus how many items are waiting to send. */
export function ConnectionChip({ pending = 0 }: { pending?: number }) {
  const { t } = useTranslation();
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true), down = () => setOnline(false);
    window.addEventListener('online', up); window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  const Icon = online ? Wifi : WifiOff;
  const text = online ? (pending ? `${t('conn.online')} · ${pending}` : t('conn.online')) : pending ? t('conn.waiting', { count: pending }) : t('conn.offline');
  return (
    <span role="status" className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm ${online ? 'border-line text-ink-muted' : 'border-warn bg-warn-tint font-semibold text-warn'}`}>
      <Icon aria-hidden="true" size={16} strokeWidth={1.75} />
      <span className={online && !pending ? 'sr-only sm:not-sr-only' : ''}>{text}</span>
    </span>
  );
}
