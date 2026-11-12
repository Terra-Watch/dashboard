import { ClipboardList, Ear, Flame, Waypoints, Wind, RadioTower, ShieldCheck, Languages, ListTodo, Map as MapIcon, MapPin, Megaphone, MessagesSquare, SatelliteDish, Layers, UserCheck, WifiOff, Camera, Route, Inbox, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';
import { StatusChip, type Status } from './StatusChip';

type Item = { id: string; Icon: LucideIcon; status?: Status };
type GroupId = 'fc' | 'people' | 'room' | 'monitor' | 'field';
const GROUPS: Array<{ id: GroupId; items: Item[] }> = [
  { id: 'fc', items: [{ id: 'map', Icon: Layers }, { id: 'bands', Icon: MapIcon }, { id: 'inputs', Icon: SatelliteDish }, { id: 'today', Icon: Flame }, { id: 'clean', Icon: ShieldCheck }] },
  { id: 'people', items: [{ id: 'report', Icon: Camera }, { id: 'follow', Icon: Route }, { id: 'near', Icon: MapPin }, { id: 'community', Icon: MessagesSquare }, { id: 'languages', Icon: Languages }] },
  { id: 'room', items: [{ id: 'queue', Icon: Inbox }, { id: 'map', Icon: MapIcon }, { id: 'sat', Icon: SatelliteDish }, { id: 'fires', Icon: MapPin }, { id: 'outlook', Icon: Waypoints }, { id: 'assign', Icon: UserCheck }, { id: 'notices', Icon: Megaphone }] },
  { id: 'monitor', items: [{ id: 'stations', Icon: RadioTower }, { id: 'smoke', Icon: Wind, status: 'soon' }, { id: 'mesh', Icon: Waypoints, status: 'soon' }, { id: 'sound', Icon: Ear, status: 'soon' }] },
  { id: 'field', items: [{ id: 'tasks', Icon: ListTodo }, { id: 'offline', Icon: WifiOff }, { id: 'record', Icon: ClipboardList }] },
];
const DEFAULTS: Record<string, string> = {
  'fc.map': 'Forecast levels|Every forest cell of 17 states on the Control Room map, shaded by the level of its 55 km area. Shown on archived days of 2025, with the fires actually detected.',
  'fc.bands': 'Levels with a meaning|None, Moderate (10%), High (30%) and Extreme (60%) are calibrated chances that a satellite detects a fire in the area tomorrow. A level says where to look first. A person decides what to do.',
  'fc.inputs': 'Fresh data, with its age|NASA satellite detections and weather feed the forecast. Every data chip shows how old it is, and a stale source says so.',
  'fc.today': 'Forecast beside what was detected|Open a past day to see the forecast next to the fires actually detected: rated areas with a fire, fires rated lower, and rated areas with none.',
  'fc.clean': 'Cleaner detections|A screen removes kilns, mines and other heat that is not a forest fire before fires are counted, so the forecast learns from real forest fires.',
  'people.report': 'Report in about a minute|Take a photo, tap what you see, and your place is found for you. With no signal, the report waits on your phone and is sent later.',
  'people.follow': 'Follow your report|See it move from received to checked, responding and closed, and read the reason it was closed.',
  'people.near': 'Know what is official near you|Official notices and emergency contacts for your area.',
  'people.community': 'Ask your neighbours|A moderated space for questions and local tips. Posts there never alert responders.',
  'people.languages': 'English, Hindi and Odia|The whole citizen app can be read in all three.',
  'room.queue': 'One triage queue|Reports for your region, oldest and most severe first.',
  'room.map': 'One map|Satellite detections in their groups, active fires, stations, forecast levels and notice areas, with how fresh each source is.',
  'room.sat': 'Detections sorted for you|Every detection falls in a group (likely fire, unconfirmed, known heat source, outside forest) with its reason in words. Nothing is hidden.',
  'room.fires': 'Active fires|Fires built from detections: size, growth, the side it grew toward and the nearest villages. Send a crew, warn villages, or mark a fire handled, out or not a forest fire.',
  'room.assign': 'Assign and track officers|See who accepted or declined and what each officer recorded.',
  'room.notices': 'Notices with a second approver|Public notices go out only after another person approves them. Community posts are moderated here.',
  'room.outlook': 'Spread outlook|For a burning fire: the cells most likely to burn in the next one to two days, in three bands. Tested on 250 fires the model had never seen.',
  'monitor.stations': 'Station list and map|Every lookout station in your area with its latest readings. A silent station shows as a gap, never as quiet.',
  'monitor.smoke': 'Smoke judged against its own normal|Fine particles against the station’s own median for that hour and against stations within 50 km, with humidity to discount fog. It never confirms a fire.',
  'monitor.mesh': 'Radio relay through deep forest|Stations pass packets through relays to a gateway where there is no mobile signal. In simulation 95 to 98% of reports arrive after the busiest relay fails. A field test is next.',
  'monitor.sound': 'Sound of chainsaws and blasts|A small model on the station tells chainsaws, blasts and open flame from other forest sounds. An alert needs repeated detections. A field test is next.',
  'field.tasks': 'Today’s tasks|Place, priority and status for every assignment.',
  'field.offline': 'Works without signal|Map areas are saved for offline use, and notes and photos wait until the phone is online.',
  'field.record': 'Record what you find|Observations and photos go straight onto the incident timeline.',
};
const CHANGED = new Set(['fc.map', 'fc.bands', 'fc.today', 'people.near', 'room.map', 'room.sat', 'room.fires', 'room.outlook', 'monitor.stations', 'monitor.smoke', 'monitor.mesh', 'monitor.sound']);

const GROUP_TITLE: Record<GroupId, string> = { fc: 'Wildfire forecasting', people: 'For people near a fire', room: 'For the Control Room', monitor: 'Field monitoring', field: 'For Range Officers' };

/** What the product does and what is coming, grouped by who uses it. Unmarked lines work today; the rest carry a status chip. */
export function Features() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const line = (group: GroupId, id: string) => {
    const [title, body] = DEFAULTS[`${group}.${id}`].split('|');
    const ns = CHANGED.has(`${group}.${id}`) ? 'v5' : 'v4';
    return { title: t(`landing.${ns}.${group}.${id}.title`, title), body: t(`landing.${ns}.${group}.${id}.body`, body) };
  };
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 space-y-8">
      <div className="max-w-2xl">
        <h2 id="features-title" className="text-3xl md:text-4xl">{t('landing.v2.features_title', 'What TerraWatch does')}</h2>
        <p className="mt-2 text-lg text-ink-muted">{t('landing.v5.features_sub', 'Forecasting comes first. Then the tools for people who report, decide and go to the place. Features marked “Coming soon” are built and being prepared for a field test.')}</p>
      </div>
      <div className="grid gap-10 lg:grid-cols-2">
        {GROUPS.map(group => (
          <div key={group.id} className="min-w-0">
            <h3 className="border-b-4 border-ink pb-2 text-2xl">{t(`landing.v2.group.${group.id}`, GROUP_TITLE[group.id])}</h3>
            <ul className="divide-y divide-line">
              {group.items.map(({ id, Icon, status }, index) => {
                const { title, body } = line(group.id, id);
                return (
                  <motion.li key={id} initial={reduce ? false : { opacity: 0, x: -12 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true, margin: '-30px' }} transition={{ duration: 0.4, delay: index * 0.06, ease: 'easeOut' }} className="group flex gap-4 py-4">
                    <Icon aria-hidden="true" className="mt-1 shrink-0 text-action transition-transform duration-200 group-hover:scale-110" size={26} strokeWidth={1.75} />
                    <div className="min-w-0"><p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-lg font-bold leading-snug">{title}{status === 'soon' && <StatusChip status={status} />}</p><p className="mt-1 text-ink-muted">{body}</p></div>
                  </motion.li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

const RULES = [
  ['people_decide', 'People decide, software only suggests', 'A model never verifies, assigns, dispatches or announces. Model output never changes a status, an assignment or a notice.'],
  ['nothing_hidden', 'Nothing is hidden, everything has a reason', 'Every satellite detection is kept and shown in a group with its reason in words. A group helps staff choose where to look; it never removes a detection.'],
  ['scoped', 'Access stops at your state', 'Staff see only the states they are assigned to, and every access is written to an audit log.'],
] as const;

/** The three rules the code enforces, as the answer to "can I trust it". */
export function Principles() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="rules-title" className="rounded-2xl bg-ink px-6 py-10 text-canvas md:px-10">
      <h2 id="rules-title" className="text-3xl md:text-4xl">{t('landing.v2.rules_title', 'How it stays trustworthy')}</h2>
      <ul className="mt-6 grid gap-8 md:grid-cols-3">
        {RULES.map(([id, title, body]) => (
          <li key={id}><p className="text-xl font-bold leading-snug">{t(`landing.v${id === 'people_decide' || id === 'nothing_hidden' ? 5 : 2}.rules.${id}.title`, title)}</p><p className="mt-2 opacity-80">{t(`landing.v${id === 'people_decide' || id === 'nothing_hidden' ? 5 : 2}.rules.${id}.body`, body)}</p></li>
        ))}
      </ul>
    </section>
  );
}
