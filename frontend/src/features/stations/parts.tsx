import { useTranslation } from 'react-i18next';
import { ageLabel, fmt, type Station } from './model';

/** Status shown by an icon-like mark AND words, never by colour alone. */
export function StatusChip({ s }: { s: Pick<Station, 'status' | 'age_s'> }) {
  const { t } = useTranslation();
  const [mark, text, cls] = s.status === 'online' ? ['●', t('stations.online', 'Online'), 'border-ok text-ink'] : s.status === 'late' ? ['◐', t('stations.late', 'Late'), 'border-warn bg-warn-tint text-ink']
    : s.status === 'never' ? ['○', t('stations.never', 'Never heard'), 'border-line text-ink-muted'] : ['○', t('stations.offline', 'Offline'), 'border-line bg-surface-2 text-ink'];
  const age = ageLabel(s.age_s);
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-sm font-semibold ${cls}`}><span aria-hidden="true">{mark}</span>{text}{age && s.status !== 'online' ? <span className="font-normal"> · {t('stations.heard_ago', { age, defaultValue: 'heard {{age}} ago' })}</span> : null}</span>;
}

export function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'high' }) {
  return <div className={`rounded-rq border p-3 ${tone === 'high' ? 'border-warn bg-warn-tint' : 'border-line bg-surface'}`}><p className="text-sm text-ink-muted">{label}</p><p className="text-2xl font-bold tabular-nums">{value}</p>{sub && <p className="text-sm text-ink-muted">{sub}</p>}</div>;
}

export function Readings({ s }: { s: Station }) {
  const { t } = useTranslation();
  const high = s.pm25_vs_normal !== null && s.pm25_vs_normal >= 2 && s.status === 'online';
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile label={t('stations.pm25', 'PM2.5 (smoke particles)')} value={fmt(s.pm25, 0, ' µg/m³')} tone={high ? 'high' : undefined}
        sub={s.pm25_vs_normal !== null ? t('stations.vs_normal', { x: s.pm25_vs_normal.toFixed(1), normal: fmt(s.pm25_normal, 0), defaultValue: '{{x}}× this station\'s normal (about {{normal}})' }) : t('stations.no_normal', 'No normal yet for this station')} />
      <Tile label={t('stations.pm10', 'PM10')} value={fmt(s.pm10, 0, ' µg/m³')} />
      <Tile label={t('stations.temp', 'Temperature')} value={fmt(s.temp_c, 1, ' °C')} />
      <Tile label={t('stations.humidity', 'Humidity')} value={fmt(s.humidity_pct, 0, ' %')} />
    </div>
  );
}
