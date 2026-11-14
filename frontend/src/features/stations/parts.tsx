import { useTranslation } from 'react-i18next';
import { ageLabel, fmt, isHigh, soundName, statementWords, type SoundEvent, type Station, type Tone } from './model';

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

/** The last sound a station reported (within 6 h): words and a mark, never colour alone. */
export function SoundChip({ s }: { s: Pick<Station, 'last_sound'> }) {
  const { t } = useTranslation();
  if (!s.last_sound) return null;
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-warn bg-warn-tint px-2.5 py-0.5 text-sm font-semibold"><span aria-hidden="true">♪</span>{t(`stations.sound_${s.last_sound.kind}`, soundName(s.last_sound.kind))} {s.last_sound.confidence} % · {ageLabel(s.last_sound.age_s)}</span>;
}

/** What the station's microphone classifier reported in the last 24 h. A prompt to check, not a person's report. */
export function Sounds({ items }: { items: SoundEvent[] }) {
  const { t } = useTranslation();
  if (!items.length) return null;
  return (
    <section aria-label={t('stations.sounds', 'What it heard')} className="rounded-rq border border-warn bg-warn-tint p-3">
      <h2 className="font-bold">{t('stations.sounds', 'What it heard')}</h2>
      <p className="text-sm">{t('stations.sounds_note', 'A sound classifier on the station, not a person: a prompt to check. It can be wrong.')}</p>
      <ul className="mt-1 space-y-0.5 text-sm tabular-nums">
        {items.slice(0, 6).map(e => <li key={e.at + e.kind}><b>{t(`stations.sound_${e.kind}`, soundName(e.kind))}</b> · {e.confidence} % {t('stations.sure', 'sure')} · {new Date(e.at).toLocaleString()}</li>)}
      </ul>
    </section>
  );
}

const TONE_MARK: Record<Tone, string> = { check: '▲', gap: '○', watch: '◐', ok: '' };
const TONE_CLASS: Record<Tone, string> = { check: 'font-bold text-warn', gap: 'text-ink-muted', watch: 'font-semibold', ok: 'text-ink-muted' };

/** What a person needs first: the plain statement (bold and marked only when it needs a look), the one reading worth seeing (only when it is actually high), and a sound heard. Shared by every station row and quick-look panel so a normal station stays quiet and an abnormal one stands out. */
export function Headline({ s }: { s: Station }) {
  const { t } = useTranslation();
  const tt = (k: string, d: string, o?: Record<string, unknown>) => t(k, { defaultValue: d, ...o });
  const tone = s.statement?.tone ?? 'ok';
  return (
    <div className="mt-1 space-y-1">
      {s.statement && <p className={`text-sm ${TONE_CLASS[tone]}`}>{TONE_MARK[tone] ? <span aria-hidden="true">{TONE_MARK[tone]} </span> : null}{statementWords(s, tt)}</p>}
      {s.last_sound && <SoundChip s={s} />}
      {isHigh(s) && <span className="inline-block rounded border border-warn bg-warn-tint px-1.5 text-sm font-semibold">▲ {tt('stations.high', '{{x}}× normal', { x: s.pm25_vs_normal?.toFixed(1) })}</span>}
    </div>
  );
}
