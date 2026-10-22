import { cellToBoundary, cellToLatLng, gridDisk, latLngToCell } from 'h3-js';
import { Flame, ScanSearch, Wind } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

const W = 640, H = 400;
const CENTER: [number, number] = [20.0, 85.0];
const SPAN = 0.5;
const project = ([lat, lng]: [number, number]) => [((lng - (CENTER[1] - SPAN)) / (2 * SPAN)) * W, H - ((lat - (CENTER[0] - SPAN * 0.625)) / (2 * SPAN * 0.625)) * H] as const;
const FOREST = ['M40 60 C90 30 170 40 210 90 S230 170 160 190 S30 150 40 60Z', 'M330 40 C410 20 500 50 530 110 S500 190 420 180 S300 120 330 40Z', 'M90 250 C150 220 250 240 270 300 S220 380 140 370 S50 310 90 250Z', 'M400 250 C470 230 570 260 590 320 S540 385 460 375 S370 310 400 250Z'];

/** Hand-drawn terrain of a made-up area: forest blocks, a river and a road. Shared by the three pictures below. */
function Terrain() {
  return (
    <g>
      <rect width={W} height={H} fill="var(--tw-map-land)" />
      <g fill="none" stroke="var(--tw-line)" strokeWidth="1" opacity="0.7"><path d="M0 120 C120 90 200 150 320 120 S520 80 640 130" /><path d="M0 330 C140 300 240 360 360 330 S560 290 640 340" /></g>
      {FOREST.map((d, i) => <path key={i} d={d} fill="var(--tw-map-forest)" opacity="0.55" />)}
      <path d="M-10 300 C100 260 180 330 300 290 S470 240 650 285" fill="none" stroke="var(--tw-map-water)" strokeWidth="14" strokeLinecap="round" opacity="0.7" />
      <path d="M0 215 C160 205 260 235 330 215 S520 190 640 210" fill="none" stroke="var(--tw-text-muted)" strokeWidth="2" strokeDasharray="7 5" opacity="0.6" />
    </g>
  );
}

function Frame({ label, children, caption }: { label: string; children: ReactNode; caption: string }) {
  return (
    <figure className="min-w-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="w-full rounded-2xl border border-line">{children}</svg>
      <figcaption className="mt-2 text-sm text-ink-muted">{caption}</figcaption>
    </figure>
  );
}

/** Rank made-up cells by distance to two made-up recent fires, then colour the top 1%, 5% and 15%. The numbers are an illustration. */
function ForecastPicture() {
  const { t } = useTranslation();
  const cells = useMemo(() => {
    const origin = latLngToCell(CENTER[0], CENTER[1], 6);
    const hot: Array<[number, number]> = [[20.1, 85.12], [19.88, 84.8]];
    const scored = gridDisk(origin, 6).map(id => {
      const [lat, lng] = cellToLatLng(id);
      const d = Math.min(...hot.map(([a, b]) => Math.hypot(lat - a, (lng - b) * 0.95)));
      const wobble = ((Math.sin(lat * 91.7) + Math.cos(lng * 73.1)) * 0.04);
      return { id, score: Math.exp(-d * 5) + wobble, points: cellToBoundary(id).map(([la, ln]) => project([la, ln]).join(',')).join(' ') };
    }).sort((a, b) => b.score - a.score);
    const n = scored.length;
    return scored.map((cell, i) => ({ ...cell, band: i < Math.max(1, Math.round(n * 0.01)) ? 0 : i < Math.round(n * 0.05) ? 1 : i < Math.round(n * 0.15) ? 2 : 3 }));
  }, []);
  const fill = ['var(--tw-danger)', 'var(--tw-ember)', 'var(--tw-warn-tint)', 'transparent'];
  const stroke = ['var(--tw-danger)', 'var(--tw-ember)', 'var(--tw-warn)', 'var(--tw-line)'];
  const legend = [[0, t('landing.v2.fc.top1', 'Highest 1%')], [1, t('landing.v2.fc.top5', 'Next 4%')], [2, t('landing.v2.fc.top15', 'Next 10%')], [3, t('landing.v2.fc.rest', 'Lower')]] as const;
  return (
    <Frame label={t('landing.v2.fc.alt', 'Map of a made-up area with forest cells coloured from highest to lower chance of fire tomorrow')} caption={t('landing.v2.illustration', 'Illustration on a made-up area with made-up values.')}>
      <Terrain />
      {cells.map(cell => <polygon key={cell.id} points={cell.points} fill={fill[cell.band]} fillOpacity={cell.band < 2 ? 0.8 : 0.9} stroke={stroke[cell.band]} strokeWidth={cell.band === 3 ? 0.6 : 1.4} opacity={cell.band === 3 ? 0.55 : 1} />)}
      <g fontSize="12" fontWeight="700" fill="var(--tw-text)">
        <rect x="16" y="16" width="118" height="26" rx="13" fill="var(--tw-surface)" stroke="var(--tw-line)" /><text x="30" y="33">{t('landing.v2.fc.tomorrow', 'Tomorrow')}</text>
        <rect x="438" y="330" width="190" height="58" rx="12" fill="var(--tw-surface)" stroke="var(--tw-line)" opacity="0.96" />
        {legend.map(([band, text], i) => <g key={band}><rect x={450 + (i % 2) * 92} y={340 + Math.floor(i / 2) * 22} width="12" height="12" fill={fill[band]} stroke={stroke[band]} /><text x={468 + (i % 2) * 92} y={351 + Math.floor(i / 2) * 22} fontSize="10.5" fontWeight="600">{text}</text></g>)}
      </g>
    </Frame>
  );
}

function PhotoScene() {
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true" className="h-auto w-full rounded-xl">
      <defs><linearGradient id="cap-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9db4c8" /><stop offset="1" stopColor="#d9c9b0" /></linearGradient></defs>
      <rect width="200" height="120" fill="url(#cap-sky)" />
      <path d="M0 78 C40 60 70 80 110 66 S170 60 200 72 V120 H0Z" fill="#4b5d3f" /><path d="M0 96 C50 84 100 100 200 88 V120 H0Z" fill="#39482f" />
      <path d="M96 70 C86 48 108 38 100 18 C122 30 118 52 126 66Z" fill="#8c8c8c" opacity="0.7" />
      <path d="M84 84 C90 66 100 70 98 56 C112 66 112 78 118 84Z" fill="#e8651a" /><path d="M94 84 C98 74 104 76 104 68 C110 74 110 80 112 84Z" fill="#f6b22b" />
    </svg>
  );
}

function AiPicture() {
  const { t } = useTranslation();
  const chip = (text: string, tone: string) => <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>{text}</span>;
  return (
    <figure className="min-w-0 space-y-4">
      <div className="grid gap-4 sm:grid-cols-[11rem_1fr] rounded-2xl border border-line bg-surface p-4">
        <PhotoScene />
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{t('landing.v2.ai.photo_check', 'Photo check')}</p>
          <div className="flex flex-wrap gap-2">
            {chip(t('landing.v2.ai.flames', 'Flames visible'), 'bg-danger-tint text-ink')}
            {chip(t('landing.v2.ai.smoke', 'Smoke visible'), 'bg-warn-tint text-ink')}
            {chip(t('landing.v2.ai.no_edit', 'No signs of editing'), 'bg-ok-tint text-ink')}
          </div>
          <p className="text-sm text-ink-muted">{t('landing.v2.ai.advice', 'Advice for the reviewer. A person decides.')}</p>
        </div>
      </div>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{t('landing.v2.ai.briefing', 'Incident briefing')}</p>
        <ul className="mt-2 space-y-1.5 text-base">
          <li>{t('landing.v2.ai.b1', 'Reported 18 minutes ago by a citizen near the forest edge.')}</li>
          <li>{t('landing.v2.ai.b2', 'The photo shows smoke and flames, with no signs of editing.')}</li>
          <li>{t('landing.v2.ai.b3', 'Satellite heat was seen 40 minutes earlier at the same place.')}</li>
          <li>{t('landing.v2.ai.b4', 'An officer accepted the task and is on the way.')}</li>
        </ul>
        <p className="mt-3 text-sm text-ink-muted">{t('landing.v2.ai.review', 'Draft for handover. A person reviews it before it is used.')}</p>
      </div>
      <figcaption className="text-sm text-ink-muted">{t('landing.v2.ai.sample', 'Sample content, not a real incident.')}</figcaption>
    </figure>
  );
}

function SimulationPicture() {
  const { t } = useTranslation();
  const [sx, sy] = [250, 250];
  const rings = [{ rx: 46, ry: 26, dx: 20, label: '1' }, { rx: 100, ry: 52, dx: 52, label: '3' }, { rx: 170, ry: 78, dx: 100, label: '6' }];
  const hours = t('landing.v2.sim.hours', 'h');
  return (
    <Frame label={t('landing.v2.sim.alt', 'Map of a made-up area with rings showing how far a fire could spread in 1, 3 and 6 hours with the wind')} caption={t('landing.v2.illustration', 'Illustration on a made-up area with made-up values.')}>
      <Terrain />
      <g transform={`rotate(-14 ${sx} ${sy})`}>
        {[...rings].reverse().map((ring, i) => <ellipse key={ring.label} cx={sx + ring.dx} cy={sy} rx={ring.rx} ry={ring.ry} fill="var(--tw-danger)" fillOpacity={0.14 + i * 0.1} stroke="var(--tw-danger)" strokeWidth="2" strokeDasharray={i === 0 ? '6 4' : undefined} />)}
        {rings.map(ring => <g key={ring.label}><rect x={sx + ring.dx + ring.rx - 30} y={sy - 12} width="40" height="22" rx="11" fill="var(--tw-surface)" stroke="var(--tw-line)" transform={`rotate(14 ${sx + ring.dx + ring.rx} ${sy})`} /><text x={sx + ring.dx + ring.rx - 22} y={sy + 3} fontSize="11" fontWeight="700" fill="var(--tw-text)" transform={`rotate(14 ${sx + ring.dx + ring.rx} ${sy})`}>{ring.label} {hours}</text></g>)}
      </g>
      <circle cx={sx} cy={sy} r="9" fill="var(--tw-danger)" stroke="var(--tw-surface)" strokeWidth="3" />
      <g fill="none" stroke="var(--tw-text)" strokeWidth="3" strokeLinecap="round"><path d="M70 90 H150" /><path d="M136 78 L152 90 L136 102" /></g>
      <text x="70" y="76" fontSize="12" fontWeight="700" fill="var(--tw-text)">{t('landing.v2.sim.wind', 'Wind')}</text>
    </Frame>
  );
}

const BULLETS: Record<'forecast' | 'ai' | 'sim', Array<[string, string]>> = {
  forecast: [['f1', 'Shown as bands (highest 1%, 5%, 15%), never as a raw number.'], ['f2', 'Built from NASA satellite fire detections, weather and the area’s own history.'], ['f3', 'Staff use it to decide where to look first. It never changes an incident.']],
  ai: [['a1', 'Photo check: spots visible flames or smoke, and signs a picture was edited or generated.'], ['a2', 'Incident briefing: a short plain-language summary for handover.'], ['a3', 'Advisory only. A person reviews every result and nothing is sent or changed automatically.']],
  sim: [['s1', 'Pick a start point, wind and time to see how far a fire could spread.'], ['s2', 'Uses terrain slope and wind, drawn as rings for the first hours.'], ['s3', 'A planning sketch for the Control Room, labelled as an estimate and not calibrated to past fires.']],
};

function Row({ id, kicker, title, body, bullets, icon, picture, flip }: { id: 'forecast' | 'ai' | 'sim'; kicker: string; title: string; body: string; bullets: string[]; icon: ReactNode; picture: ReactNode; flip?: boolean }) {
  return (
    <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <div className={`min-w-0 ${flip ? 'lg:order-2' : ''}`}>
        <p className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-action">{icon}{kicker}</p>
        <h3 id={`cap-${id}`} className="mt-2 text-3xl leading-tight md:text-4xl">{title}</h3>
        <p className="mt-3 text-lg text-ink-muted">{body}</p>
        <ul className="mt-5 space-y-3">{bullets.map(text => <li key={text} className="flex gap-3"><span aria-hidden="true" className="mt-2.5 size-2 shrink-0 rounded-full bg-action" /><span>{text}</span></li>)}</ul>
      </div>
      <div className={`min-w-0 ${flip ? 'lg:order-1' : ''}`}>{picture}</div>
    </div>
  );
}

/** The three headline capabilities, each with a picture of what staff see. */
export function Capabilities() {
  const { t } = useTranslation();
  const bullets = (group: 'forecast' | 'ai' | 'sim') => BULLETS[group].map(([id, text]) => t(`landing.v2.cap.${id}`, text));
  return (
    <section id="forecast" aria-labelledby="cap-title" className="scroll-mt-20 space-y-16">
      <div className="max-w-2xl">
        <h2 id="cap-title" className="text-3xl md:text-4xl">{t('landing.v2.cap_title', 'Forecast, AI and simulation')}</h2>
        <p className="mt-2 text-lg text-ink-muted">{t('landing.v2.cap_sub', 'Three tools that help staff decide where to look, what to trust and what could happen next.')}</p>
      </div>
      <Row id="forecast" icon={<Flame aria-hidden="true" size={18} />} kicker={t('landing.v2.fc.kicker', 'Wildfire forecasting')} title={t('landing.v2.fc.title', 'See where fire is most likely tomorrow')}
        body={t('landing.v2.fc.body', 'Each day the forecast ranks forest areas from the lowest to the highest chance of fire the next day, so staff know where to look first.')} bullets={bullets('forecast')} picture={<ForecastPicture />} />
      <Row id="ai" flip icon={<ScanSearch aria-hidden="true" size={18} />} kicker={t('landing.v2.ai.kicker', 'AI assistance')} title={t('landing.v2.ai.title', 'A second pair of eyes on every photo and every incident')}
        body={t('landing.v2.ai.body', 'AI reads the evidence people send and drafts the summary staff need, so the Control Room spends its time on decisions.')} bullets={bullets('ai')} picture={<AiPicture />} />
      <Row id="sim" icon={<Wind aria-hidden="true" size={18} />} kicker={t('landing.v2.sim.kicker', 'Fire spread simulation')} title={t('landing.v2.sim.title', 'Try a what-if before the wind changes')}
        body={t('landing.v2.sim.body', 'Place a fire on the map, set the wind, and see the areas it could reach in the next hours, so crews can plan where to go.')} bullets={bullets('sim')} picture={<SimulationPicture />} />
    </section>
  );
}
