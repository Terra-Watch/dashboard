import { Flame, RadioTower, SatelliteDish, Waypoints } from 'lucide-react';
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

const GROUPS: Array<[string, string, string, string]> = [
  ['likely', 'Likely fire', 'Burn scar likely, or seen again at the same place within 72 hours.', 'bg-warn-tint'],
  ['unconfirmed', 'Unconfirmed', 'A low chance of a burn scar. Kept and shown, never hidden.', 'bg-surface-2'],
  ['known', 'Known heat source', 'A mine, kiln or power plant within 1 km, or a pixel that keeps firing outside the fire season.', 'bg-surface-2'],
  ['outside', 'Outside forest', 'The detection lies outside the forest boundary.', 'bg-surface-2'],
];

/** The groups a satellite detection can fall into, in the app's own words. */
function GroupsPicture() {
  const { t } = useTranslation();
  return (
    <figure className="min-w-0 rounded-2xl border border-line bg-surface p-4">
      <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{t('landing.v5.sat.list', 'Satellite detections')}</p>
      <ul className="mt-3 divide-y divide-line">
        {GROUPS.map(([id, label, text, tone]) => (
          <li key={id} className="flex flex-wrap items-start gap-x-3 gap-y-1 py-3">
            <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>{t(`landing.v5.sat.g_${id}`, label)}</span>
            <span className="min-w-0 flex-1 basis-48 text-ink-muted">{t(`landing.v5.sat.r_${id}`, text)}</span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v5.sat.caption', 'Every detection gets one group and a reason. A group helps staff choose where to look first; it is not a verdict.')}</figcaption>
    </figure>
  );
}

type Row_ = [string, string, string, string];
const STATIONS: Row_[] = [['Ridge 2', 'reporting', 'PM2.5 normal for the hour', 'bg-ok-tint'], ['Tower 5', 'reporting', 'PM2.5 rising · check', 'bg-warn-tint'], ['Relay 3', 'late', 'Last report 40 min ago', 'bg-warn-tint'], ['Ridge 7', 'silent', 'Silent: shown as a gap', 'bg-surface-2']];

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
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${tone}`}>{t(`landing.v5.mon.${status}`, status[0].toUpperCase() + status.slice(1))}</span>
            <span className="min-w-0 flex-1 basis-48 text-ink-muted">{t(`landing.v5.mon.r_${name.replace(' ', '').toLowerCase()}`, text)}</span>
          </li>
        ))}
      </ul>
      <figcaption className="mt-2 text-sm text-ink-muted">{t('landing.v4.mon.caption', 'Example of the layout. A high reading is a prompt to check, not a fire.')}</figcaption>
    </figure>
  );
}

type RowId = 'forecast' | 'sat' | 'sim' | 'mon';
const BULLETS: Record<RowId, Array<[string, string]>> = {
  forecast: [['f1', 'Four levels from a calibrated chance: None, Moderate (10%), High (30%) and Extreme (60%).'], ['f2', 'Built from NASA satellite fire detections, weather and each area’s own history.'], ['f3', 'Kilns, mines and other heat that is not a forest fire are removed before the model learns.'], ['f4', 'Yesterday’s forecast is set beside what was detected, so staff see how it did.']],
  sat: [['s1', 'Four groups: likely fire, unconfirmed, known heat source and outside forest.'], ['s2', 'A classifier scores the chance that a burn scar follows within 1 km of the detection.'], ['s3', 'Nothing is hidden: every group can be switched on, and an unconfirmed detection seen again becomes likely.'], ['s4', 'Detections within 1 km and 36 hours form one active fire, with its size, growth and nearest villages.']],
  sim: [['p1', 'In three bands, with the roads and the nearest named places around the fire.'], ['p2', 'A ranking of where, not when: it gives no arrival time.'], ['p3', 'Tested on 250 fires of 2025 the model had never seen, and on three states held out of training.']],
  mon: [['m1', 'A list and a map of every station in your area: reporting, late or silent.'], ['m2', 'Smoke is judged against the station’s own normal for the hour and against its neighbours, so haze and fog are not read as fire.'], ['m3', 'Stations pass packets through relay nodes to a gateway, so deep forest without mobile signal is covered. A silent station shows as a gap, never as quiet.'], ['m4', 'A station never confirms a fire. A reading is a prompt to check, and only a ranger on the ground confirms.']],
};

function Row({ id, kicker, title, body, bullets, icon, picture, flip, soon }: { soon?: boolean; id: RowId; kicker: string; title: string; body: string; bullets: string[]; icon: ReactNode; picture: ReactNode; flip?: boolean }) {
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

/** The four headline capabilities, each with a picture of what staff see. */
export function Capabilities() {
  const { t } = useTranslation();
  const bullets = (group: RowId) => BULLETS[group].map(([id, text]) => t(`landing.v5.cap.${id}`, text));
  return (
    <section id="forecast" aria-labelledby="cap-title" className="scroll-mt-20 space-y-16">
      <div className="max-w-2xl">
        <h2 id="cap-title" className="text-3xl md:text-4xl">{t('landing.v5.cap_title', 'Forecast, sort, follow the spread, and watch.')}</h2>
        <p className="mt-2 text-lg text-ink-muted">{t('landing.v5.cap_sub', 'The forecast tells staff where to look. Satellite detections are sorted into real fires and false ones. The spread outlook shows where a burning fire is likely to go. Lookout stations watch between satellite passes.')}</p>
      </div>
      <Row id="forecast" icon={<Flame aria-hidden="true" size={18} />} kicker={t('landing.v2.fc.kicker', 'Wildfire forecasting')} title={t('landing.v2.fc.title', 'See where fire is most likely tomorrow')}
        body={t('landing.v5.fc.body', 'The forecast gives the chance that a satellite will detect a fire in each 55 km forest area of 17 states the next day, as a level from None to Extreme, with the places to look first and the action for the level.')} bullets={bullets('forecast')} picture={<ForecastSnapshot />} />
      <Row id="sat" flip icon={<SatelliteDish aria-hidden="true" size={18} />} kicker={t('landing.v5.sat.kicker', 'Satellite detections')} title={t('landing.v5.sat.title', 'Tell real fires from false ones')}
        body={t('landing.v5.sat.body', 'Every satellite detection is kept and sorted into a group with the reason in words, so staff look first at the ones most likely to be a forest fire.')} bullets={bullets('sat')} picture={<GroupsPicture />} />
      <Row id="sim" icon={<Waypoints aria-hidden="true" size={18} />} kicker={t('landing.v4.sim.kicker', 'Fire spread outlook')} title={t('landing.v4.sim.title', 'Know where an active fire is likely to go next')}
        body={t('landing.v5.sim.body', 'Pick a burning fire and see the cells most likely to burn in the next 24 or 48 hours. On 244 test fires of 2025 the top band held a median 75% of what burned. It shows archived fires.')} bullets={bullets('sim')} picture={<OutlookSnapshot />} />
      <Row id="mon" flip soon icon={<RadioTower aria-hidden="true" size={18} />} kicker={t('landing.v4.mon.kicker', 'Field monitoring')} title={t('landing.v4.mon.title', 'Lookout stations that watch the forest between satellite passes')}
        body={t('landing.v5.mon.body', 'Fixed lookout stations on ridges and towers read fine particles, temperature and humidity, and listen for chainsaws and blasts. They pass their readings through relay stations to a gateway over a low-power radio mesh. The software and the network are tested; a field test comes next.')} bullets={bullets('mon')} picture={<StationsPicture />} />
    </section>
  );
}
