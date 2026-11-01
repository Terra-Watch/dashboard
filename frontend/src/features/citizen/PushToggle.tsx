import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { Notice } from '../../ui/Notice';

const toBytes = (value: string) => { const pad = '='.repeat((4 - (value.length % 4)) % 4); const raw = atob((value + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, ch => ch.charCodeAt(0)); };

/** "Alerts on this phone": asks the browser for permission only when the person taps, and tells the server which state to send for. */
export function PushToggle({ state, staff = false }: { state?: string; staff?: boolean }) {
  const { t } = useTranslation();
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const [on, setOn] = useState(false); const [busy, setBusy] = useState(false); const [problem, setProblem] = useState('');
  useEffect(() => { if (!supported) return; void navigator.serviceWorker.ready.then(reg => reg.pushManager.getSubscription()).then(sub => setOn(Boolean(sub))).catch(() => undefined); }, [supported]);
  if (!supported) return <p className="text-sm text-ink-muted">{t('citizen.push.unsupported', 'This browser cannot show alerts. On an iPhone, add TerraWatch to the Home Screen first, then open it from there.')}</p>;

  async function turnOn() {
    setBusy(true); setProblem('');
    try {
      if (!staff && !state) throw new Error(t('citizen.push.need_state', 'Choose your state above first.'));
      const config = await api<{ enabled: boolean; public_key: string | null }>('/api/push/config');
      if (!config.enabled || !config.public_key) throw new Error(t('citizen.push.off', 'Alerts on phones are not switched on yet.'));
      if ((await Notification.requestPermission()) !== 'granted') throw new Error(t('citizen.push.denied', 'Notifications are blocked for this site. Allow them in your browser settings, then try again.'));
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(config.public_key) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await api('/api/push/subscribe', { method: 'POST', json: { endpoint: json.endpoint, keys: json.keys, state: staff ? null : state } });
      setOn(true);
    } catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : reason instanceof Error ? reason.message : t('citizen.push.failed', 'Alerts could not be turned on.')); }
    finally { setBusy(false); }
  }
  async function turnOff() {
    setBusy(true); setProblem('');
    try {
      const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
      if (sub) { await api('/api/push/unsubscribe', { method: 'POST', json: { endpoint: sub.endpoint } }).catch(() => undefined); await sub.unsubscribe(); }
      setOn(false);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-2">
      {problem && <Notice kind="warning">{problem}</Notice>}
      <p className="text-sm text-ink-muted">{staff ? (on ? t('staff.push.on', 'This device will get a message for your own alerts: new reports, tasks and field checks.') : t('staff.push.explain', 'Get a message on this device for your own alerts: new reports, tasks and field checks. The message never contains report text.'))
        : on ? t('citizen.push.on', 'This phone will get a message when officials confirm a fire in your state, and when officials ask about your report.') : t('citizen.push.explain', 'Get a message on this phone when officials confirm a fire in your state, or ask about your report. Only confirmed fires, never unchecked reports.')}</p>
      {on ? <Button variant="secondary" loading={busy} onClick={() => void turnOff()}>{t('citizen.push.turn_off', 'Turn off alerts on this phone')}</Button>
        : <Button loading={busy} onClick={() => void turnOn()}>{t('citizen.push.turn_on', 'Turn on alerts on this phone')}</Button>}
    </div>
  );
}
