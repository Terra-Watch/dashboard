import { Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** The one line that must never be missed: in danger, call 112 first. A tap dials. Not a message box, so it cannot be mistaken for one. */
export function EmergencyStrip({ className = '' }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-4 gap-y-3 rounded-2xl bg-ink px-5 py-4 text-canvas ${className}`}>
      <p className="min-w-0 flex-1 basis-56 text-lg font-semibold leading-snug">{t('landing.hero.emergency')}</p>
      <a href="tel:112" className="inline-flex min-h-12 shrink-0 items-center gap-2 rounded-full bg-canvas px-5 text-lg font-bold text-ink hover:opacity-90">
        <Phone aria-hidden="true" size={20} strokeWidth={2} />{t('citizen.v2.call_112', 'Call 112')}
      </a>
    </div>
  );
}
