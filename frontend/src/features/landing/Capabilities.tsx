import { Flame, RadioTower, ScanSearch, Waypoints } from 'lucide-react';
import { StatusChip } from './StatusChip';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ForecastSnapshot } from './ForecastSnapshot';
import { OutlookSnapshot } from './OutlookSnapshot';
import { Reveal } from './Reveal';

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

const RESULTS: Array<[string, string, string, string]> = [
  ['clear', 'No concern found', 'Nothing unusual was seen. This is not proof the photo is real.', 'bg-ok-tint'],
  ['edited', 'Possibly edited', 'Signs that the picture was changed. Held for a person.', 'bg-warn-tint'],
  ['ai', 'Possibly AI-made', 'Signs that the picture was generated. Held for a person.', 'bg-warn-tint'],
  ['reused', 'Reused picture', 'The same picture was seen before. Held for a person.', 'bg-warn-tint'],
  ['unclear', 'Inconclusive', 'Too small or unclear to judge. A person looks at it.', 'bg-surface-2'],
  ['off', 'Check unavailable', 'The check could not run. A person looks at it.', 'bg-surface-2'],
];

/** The results a reviewer can see beside a photo, in the app's own words. */
function AiPicture() {
  const { t } = useTranslation();
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{t('landing.v2.ai.photo_check', 'Photo check')}</p>
      <ul className="mt-3 divide-y divide-line">
        {RESULTS.map(([id, label, text, tone]) => (
          <li key={id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3">
            <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>{t(`landing.v3.auth.${id}`, label)}</span>
            <span className="min-w-0 flex-1 basis-48 text-ink-muted">{t(`landing.v3.aires.${id}`, text)}</span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v2.ai.advice', 'Advice for the reviewer. A person decides.')}</figcaption>
    </figure>
  );
}

type Row_ = [string, string, string, string];
const STATIONS: Row_[] = [['Ridge 2', 'online', 'PM2.5 normal · wind 14 km/h NW', 'bg-ok-tint'], ['Tower 5', 'online', 'PM2.5 rising · check', 'bg-warn-tint'], ['Relay 3', 'late', 'Last report 40 min ago', 'bg-warn-tint'], ['Ridge 7', 'offline', 'Silent: shown as a gap', 'bg-surface-2']];

/** The station list as staff see it. The names and readings are examples of the layout, not live data. */
function StationsPicture() {
  const { t } = useTranslation();
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{t('landing.v4.mon.list', 'Lookout stations')}</p>
      <ul className="mt-3 divide-y divide-line">
        {STATIONS.map(([name, status, text, tone]) => (
          <li key={name} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3">
            <span className="font-semibold">{name}</span>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>{t(`landing.v4.mon.${status}`, status[0].toUpperCase() + status.slice(1))}</span>
            <span className="min-w-0 flex-1 basis-48 text-ink-muted">{t(`landing.v4.mon.r_${name.split(' ')[0].toLowerCase()}`, text)}</span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v4.mon.caption', 'Example of the layout. A high reading is a prompt to check, not a fire.')}</figcaption>
    </figure>
  );
}

const BULLETS: Record<'forecast' | 'ai' | 'sim' | 'mon', Array<[string, string]>> = {
  mon: [['m1', 'A list and a map of every station in your area: online, late or offline, with battery and the latest readings.'], ['m2', 'Smoke (PM2.5 against the station’s own baseline), wind, temperature and humidity at a known place.'], ['m3', 'Stations pass packets through relay nodes to a gateway, so deep forest without mobile signal is covered. A silent station shows as a gap, never as quiet.'], ['m4', 'A reading is a prompt to check, not a fire. Only a person on the ground confirms.']],
  forecast: [['f1', 'Shown as bands (highest 1%, 5%, 15%), never as a raw number.'], ['f2', 'Built from NASA satellite fire detections, weather and each area’s own history.'], ['f3', 'Detections from kilns, mines and other heat that is not a forest fire are screened out first.'], ['f4', 'Today’s detections sit next to tomorrow’s forecast, so staff see what is burning and where to look next.']],
  ai: [['a1', 'Photo check: spots visible flames or smoke, and signs a picture was edited or generated.'], ['a2', 'Incident briefing (coming soon): a short plain-language summary for handover.'], ['a3', 'Advisory only. A person reviews every result and nothing is sent or changed automatically.']],
  sim: [['s1', 'One plain sentence: the direction, the ground and the slope the fire is most likely to take.'], ['s2', 'Shows the people, places and roads inside each band.'], ['s3', 'Tested on 250 fires the model had never seen. It ranks cells; it does not say how far or how fast.']],
};

function Row({ id, kicker, title, body, bullets, icon, picture, flip, soon }: { soon?: boolean; id: 'forecast' | 'ai' | 'sim' | 'mon'; kicker: string; title: string; body: string; bullets: string[]; icon: ReactNode; picture: ReactNode; flip?: boolean }) {
  return (
    <Reveal className="grid items-center gap-8 lg:grid-cols-2 lg:gap-14">
      <div className={`min-w-0 ${flip ? 'lg:order-2' : ''}`}>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold uppercase tracking-wide text-action"><span className="inline-flex items-center gap-2">{icon}{kicker}</span>{soon && <StatusChip status="soon" />}</p>
        <h3 id={`cap-${id}`} className="mt-2 text-3xl leading-tight md:text-4xl">{title}</h3>
        <p className="mt-3 text-lg text-ink-muted">{body}</p>
        <ul className="mt-5 space-y-3">{bullets.map(text => <li key={text} className="flex gap-3"><span aria-hidden="true" className="mt-2.5 size-2 shrink-0 rounded-full bg-action" /><span>{text}</span></li>)}</ul>
      </div>
      <div className={`min-w-0 ${flip ? 'lg:order-1' : ''}`}>{picture}</div>
    </Reveal>
  );
}

/** The three headline capabilities, each with a picture of what staff see. */
export function Capabilities() {
  const { t } = useTranslation();
  const bullets = (group: 'forecast' | 'ai' | 'sim' | 'mon') => BULLETS[group].map(([id, text]) => t(`landing.v4.cap.${id}`, text));
  return (
    <section id="forecast" aria-labelledby="cap-title" className="scroll-mt-20 space-y-16">
      <div className="max-w-2xl">
        <h2 id="cap-title" className="text-3xl md:text-4xl">{t('landing.v4.cap_title', 'Forecast, check, see where it spreads, and watch.')}</h2>
        <p className="mt-2 text-lg text-ink-muted">{t('landing.v4.cap_sub', 'The forecast tells staff where to look. AI helps them check what they find. The spread outlook shows where an active fire is likely to go. Lookout stations watch between satellite passes.')}</p>
      </div>
      <Row id="forecast" icon={<Flame aria-hidden="true" size={18} />} kicker={t('landing.v2.fc.kicker', 'Wildfire forecasting')} title={t('landing.v2.fc.title', 'See where fire is most likely tomorrow')}
        body={t('landing.v4.fc.body', 'The forecast ranks the forest areas of 17 states from the lowest to the highest chance of fire the next day, so staff know where to look first. It runs on archived days today, while daily scoring is built.')} bullets={bullets('forecast')} picture={<ForecastSnapshot />} />
      <Row id="ai" flip icon={<ScanSearch aria-hidden="true" size={18} />} kicker={t('landing.v2.ai.kicker', 'AI assistance')} title={t('landing.v2.ai.title', 'A second pair of eyes on every photo and every incident')}
        body={t('landing.v2.ai.body', 'AI reads the photos people send and tells the reviewer what it sees, so the Control Room spends its time on decisions.')} bullets={bullets('ai')} picture={<AiPicture />} />
      <Row id="sim" icon={<Waypoints aria-hidden="true" size={18} />} kicker={t('landing.v4.sim.kicker', 'Fire spread outlook')} title={t('landing.v4.sim.title', 'Know where an active fire is likely to go next')}
        body={t('landing.v4.sim.body', 'Pick an active fire and see the cells most likely to burn in the next 24 or 48 hours, in three bands, with the people, places and roads in the way. It shows archived fires while live scoring is built.')} bullets={bullets('sim')} picture={<OutlookSnapshot />} />
      <Row id="mon" flip soon icon={<RadioTower aria-hidden="true" size={18} />} kicker={t('landing.v4.mon.kicker', 'Field monitoring')} title={t('landing.v4.mon.title', 'Lookout stations that watch the forest between satellite passes')}
        body={t('landing.v4.mon.body', 'Solar lookout stations on ridges and towers report smoke and wind over a low-power radio mesh. The station list, map and data intake are built; the radios are being prepared for a field test, and no detection range is claimed before it.')} bullets={bullets('mon')} picture={<StationsPicture />} />
    </section>
  );
}
