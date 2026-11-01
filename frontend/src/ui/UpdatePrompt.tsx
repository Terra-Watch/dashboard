import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

const SNOOZE_KEY = 'tw_update_snooze';
const snoozed = () => { try { return Date.now() < Number(localStorage.getItem(SNOOZE_KEY) ?? 0); } catch { return false; } };

/** Tells the person a new version is ready and lets them choose when to reload, so nothing they are typing is lost. */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const [worker, setWorker] = useState<ServiceWorker | null>(null);
  const asked = useRef(false);   // the first install also changes the controller; only reload when the person asked for the update
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const watch = (registration: ServiceWorkerRegistration) => {
      const check = () => {
        if (!registration.waiting || !navigator.serviceWorker.controller) return;
        // A new version found right as the app opens, before the person has touched anything, is applied at once (once per visit), so the prompt is rare.
        if (performance.now() < 4000 && document.activeElement === document.body && !sessionStorage.getItem('tw_auto_updated')) {
          try { sessionStorage.setItem('tw_auto_updated', '1'); } catch { /* the prompt below still works */ }
          asked.current = true; registration.waiting.postMessage({ type: 'SKIP_WAITING' }); return;
        }
        if (!snoozed()) setWorker(registration.waiting);
      };
      check();
      registration.addEventListener('updatefound', () => registration.installing?.addEventListener('statechange', check));
    };
    void navigator.serviceWorker.getRegistration().then(registration => registration && watch(registration));
    const onRegistered = () => void navigator.serviceWorker.getRegistration().then(registration => registration && watch(registration));
    window.addEventListener('tw-sw-registered', onRegistered);
    let reloading = false;
    const onChange = () => { if (asked.current && !reloading) { reloading = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener('controllerchange', onChange);
    return () => { window.removeEventListener('tw-sw-registered', onRegistered); navigator.serviceWorker.removeEventListener('controllerchange', onChange); };
  }, []);
  if (!worker) return null;
  return (
    <div role="status" data-rq-app className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center justify-between gap-3 rounded-panel border border-control bg-surface p-3 text-ink shadow-lg md:bottom-6">
      <span className="text-sm">{t('app.update', 'A new version is ready.')}</span>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => { try { localStorage.setItem(SNOOZE_KEY, String(Date.now() + 6 * 3600_000)); } catch { /* it just asks again */ } setWorker(null); }}>{t('app.later', 'Later')}</Button>
        <Button onClick={() => { asked.current = true; worker.postMessage({ type: 'SKIP_WAITING' }); }}>{t('app.reload', 'Reload')}</Button>
      </div>
    </div>
  );
}
