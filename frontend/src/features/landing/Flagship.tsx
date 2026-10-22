import { CloudSun, FileText, FlaskConical, ScanSearch } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** Band colours for the forecast picture. Rank bands, not probabilities. */
const BANDS = [
  { id: 'top1', fill: 'var(--tw-danger)' },
  { id: 'top5', fill: 'var(--tw-ember)' },
  { id: 'top15', fill: 'var(--tw-warn)' },
  { id: 'rest', fill: 'var(--tw-line)' },
] as const;

function ForecastArt() {
  const { t } = useTranslation();
  // A made-up grid of forest cells: the hot cells cluster, the rest fade out.
  const cells = Array.from({ length: 8 * 14 }, (_, i) => {
    const x = i % 14, y = Math.floor(i / 14);
    const d = Math.hypot(x - 9, y - 3) + Math.sin(x * 1.7 + y) * 0.7;
    return d < 1.3 ? 0 : d < 2.6 ? 1 : d < 4.4 ? 2 : 3;
  });
  return (
    <figure aria-label={t('landing.v2.flag.forecast.art', 'Illustration: forest cells shaded by next-day fire rank, made-up area')} className="rounded-2xl border border-line bg-surface p-4">
      <svg viewBox="0 0 280 160" role="img" className="w-full"><title>{t('landing.v2.flag.forecast.art', 'Illustration: forest cells shaded by next-day fire rank, made-up area')}</title>
        {cells.map((band, i) => <rect key={i} x={(i % 14) * 20 + 1} y={Math.floor(i / 14) * 20 + 1} width="18" height="18" rx="3" fill={BANDS[band].fill} opacity={band === 3 ? 0.55 : 1} />)}
      </svg>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {BANDS.map(b => <li key={b.id} className="flex items-center gap-2"><span aria-hidden="true" className="size-3.5 rounded" style={{ background: b.fill }} />{t(`landing.v2.flag.band.${b.id}`, b.id === 'top1' ? 'Top 1%' : b.id === 'top5' ? 'Top 5%' : b.id === 'top15' ? 'Top 15%' : 'The rest')}</li>)}
      </ul>
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v2.flag.forecast.note', 'Ranked bands for tomorrow. Illustration on a made-up area.')}</figcaption>
    </figure>
  );
}

function BriefArt() {
  const { t } = useTranslation();
  return (
    <figure className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-2"><span className="rounded-full bg-warn-tint px-3 py-0.5 text-sm font-bold">{t('landing.v2.flag.brief.draft', 'Draft')}</span><span className="text-sm text-ink-muted">{t('landing.v2.flag.brief.sample', 'Sample, made-up incident')}</span></div>
      <p className="mt-3 text-base leading-relaxed">
        {t('landing.v2.flag.brief.l1a', 'Verified fire near')} <mark className="rounded bg-action-tint px-1 text-ink">{t('landing.v2.flag.brief.place', 'Kuldiha ridge')}</mark>{' '}
        {t('landing.v2.flag.brief.l1b', 'at')} <mark className="rounded bg-action-tint px-1 text-ink">06:40</mark>. {t('landing.v2.flag.brief.l2a', 'Wind')} <mark className="rounded bg-action-tint px-1 text-ink">{t('landing.v2.flag.brief.wind', '18 km/h from the south-west')}</mark>. {t('landing.v2.flag.brief.l3', 'Wind is pushing the fire toward the village; the road is the likely access.')}
      </p>
      <p className="mt-3 border-t border-line pt-3 text-sm text-ink-muted">{t('landing.v2.flag.brief.range', 'Range under stated inputs, not a prediction of what will burn.')}</p>
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v2.flag.brief.legend', 'Highlighted words come straight from the data. The model writes only the connecting sentences.')}</figcaption>
    </figure>
  );
}

function SimArt() {
  const { t } = useTranslation();
  return (
    <figure className="rounded-2xl border border-line bg-surface p-4">
      <svg viewBox="0 0 280 160" role="img" className="w-full rounded-xl" style={{ background: 'var(--tw-map-land)' }}><title>{t('landing.v2.flag.sim.art', 'Illustration: a fire start point with a spread range stretched along the wind, made-up area')}</title>
        <path d="M0 120 C60 100 120 140 200 118 S260 100 280 110 V160 H0Z" fill="var(--tw-map-water)" opacity="0.55" />
        <ellipse cx="170" cy="70" rx="100" ry="42" transform="rotate(-18 170 70)" fill="var(--tw-warn-tint)" stroke="var(--tw-warn)" strokeWidth="2" strokeDasharray="6 4" opacity="0.9" />
        <ellipse cx="150" cy="78" rx="55" ry="24" transform="rotate(-18 150 78)" fill="var(--tw-danger-tint)" stroke="var(--tw-danger)" strokeWidth="2" />
        <circle cx="112" cy="90" r="6" fill="var(--tw-danger)" stroke="var(--tw-surface)" strokeWidth="2" />
        <rect x="236" y="38" width="9" height="9" fill="var(--tw-text)" /><rect x="248" y="44" width="9" height="9" fill="var(--tw-text)" />
        <path d="M70 40 H120 M112 34 L120 40 L112 46" stroke="var(--tw-text)" strokeWidth="2.5" fill="none" />
        <text x="22" y="34" fontSize="11" fontWeight="600" fill="var(--tw-text)">{t('landing.v2.flag.sim.wind', 'Wind')}</text>
      </svg>
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v2.flag.sim.note', 'Start point, a likely range and a wider range, stretched along the wind. A planning sketch on a made-up area.')}</figcaption>
    </figure>
  );
}

const ROWS = [
  { id: 'forecast', Icon: CloudSun, Art: ForecastArt, title: 'Wildfire forecasting', body: 'Every forest cell is ranked each day for its chance of a fire tomorrow, using satellite detections, weather and the day-ahead weather forecast. Staff see the result as bands (top 1%, 5%, 15%), never as a promise. It is a ranking to focus attention, and a person decides what to do.', points: ['Next-day ranking for every forest cell', 'Built from NASA satellite detections and weather', 'Shown as bands, with how fresh the data is'] },
  { id: 'ai', Icon: ScanSearch, Art: BriefArt, title: 'AI that drafts and double-checks', body: 'Two AI helpers support the Control Room. The photo check reads each photo for visible fire or smoke and for signs of editing or AI generation. The incident briefing turns a verified fire into a short written brief. Both only advise: a person reviews, edits and sends. The system never sends.', points: ['Photo check: fire, smoke, edited or AI-made images', 'Incident briefing: a draft the commander edits and sends', 'The model never writes a number or a place; those come from the data', 'Briefs can be written in English, Hindi and Odia'] },
  { id: 'sim', Icon: FlaskConical, Art: SimArt, title: 'Fire spread simulation', body: 'Pick a start point, set the wind, and see a likely range and a wider range of how a fire could spread across terrain, with settlements, roads and water at risk. It runs in the browser for the Control Room as a what-if tool and is always labelled as an estimate under the inputs you set.', points: ['Start point, wind and terrain', 'A likely range and a wider range', 'Settlements, roads and water at risk', 'Labelled "range under stated inputs"'] },
] as const;

/** The three headline capabilities, each with a picture and a short list, ahead of the full feature list. */
export function Flagship() {
  const { t } = useTranslation();
  return (
    <section id="flagship" aria-labelledby="flagship-title" className="scroll-mt-20 space-y-12">
      <div className="max-w-2xl">
        <h2 id="flagship-title" className="text-3xl md:text-4xl">{t('landing.v2.flag.title', 'Forecast it. Check it. Plan for it.')}</h2>
        <p className="mt-2 text-lg text-ink-muted">{t('landing.v2.flag.sub', 'Three tools that help the Control Room act before and during a fire.')}</p>
      </div>
      {ROWS.map(({ id, Icon, Art, title, body, points }, index) => (
        <div key={id} className={`grid items-center gap-8 md:grid-cols-2 ${index % 2 ? 'md:[&>*:first-child]:order-2' : ''}`}>
          <div className="min-w-0">
            <span className="flex size-12 items-center justify-center rounded-full bg-action-tint text-action"><Icon aria-hidden="true" size={26} strokeWidth={1.75} /></span>
            <h3 className="mt-4 text-2xl md:text-3xl">{t(`landing.v2.flag.${id}.title`, title)}</h3>
            <p className="mt-3 text-lg leading-relaxed text-ink-muted">{t(`landing.v2.flag.${id}.body`, body)}</p>
            <ul className="mt-4 space-y-2">{points.map((point, i) => <li key={i} className="flex gap-3"><span aria-hidden="true" className="mt-2.5 size-2 shrink-0 rounded-full bg-action" /><span>{t(`landing.v2.flag.${id}.p${i + 1}`, point)}</span></li>)}</ul>
          </div>
          <div className="min-w-0"><Art /></div>
        </div>
      ))}
    </section>
  );
}

export { FileText };
