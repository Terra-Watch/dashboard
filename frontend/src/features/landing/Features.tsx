import { ClipboardList, Languages, ListTodo, Map as MapIcon, MapPin, Megaphone, MessagesSquare, UserCheck, WifiOff, Camera, Route, Inbox, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';

type Item = { id: string; Icon: LucideIcon };
const GROUPS: Array<{ id: 'people' | 'room' | 'field'; items: Item[] }> = [
  { id: 'people', items: [{ id: 'report', Icon: Camera }, { id: 'follow', Icon: Route }, { id: 'near', Icon: MapPin }, { id: 'community', Icon: MessagesSquare }, { id: 'languages', Icon: Languages }] },
  { id: 'room', items: [{ id: 'queue', Icon: Inbox }, { id: 'map', Icon: MapIcon }, { id: 'assign', Icon: UserCheck }, { id: 'notices', Icon: Megaphone }] },
  { id: 'field', items: [{ id: 'tasks', Icon: ListTodo }, { id: 'offline', Icon: WifiOff }, { id: 'record', Icon: ClipboardList }] },
];
const DEFAULTS: Record<string, string> = {
  'people.report': 'Report in about a minute|Take a photo, tap what you see, and your place is found for you. With no signal, the report waits on your phone and is sent later.',
  'people.follow': 'Follow your report|See it move from received to checked, responding and closed, and read the reason it was closed.',
  'people.near': 'Know what is official near you|Official notices, verified fire areas (coarse and delayed, to protect people) and emergency contacts.',
  'people.community': 'Ask your neighbours|A moderated space for questions and local tips. Posts there never alert responders.',
  'people.languages': 'English, Hindi and Odia|The whole citizen app can be read in all three.',
  'room.queue': 'One triage queue|Reports for your region, oldest and most severe first.',
  'room.map': 'One map|NASA satellite detections, citizen reports, verified incidents and notice areas, with the wind and how fresh each source is.',
  'room.photo': 'A second look at every photo|A model reads each photo for visible fire or smoke and for signs of editing or AI generation. It only advises. A person decides.',
  'room.assign': 'Assign and track officers|See who accepted or declined and what each officer recorded.',
  'room.notices': 'Notices with a second approver|Public notices go out only after another person approves them. Community posts are moderated here.',
  'room.forecast': 'Next-day wildfire forecast|Forest areas ranked from low to high chance of fire tomorrow, from satellite detections and weather. Shown as bands, never as a promise. A person decides what to do.',
  'room.briefing': 'AI incident briefing|A short plain-language summary of each incident: what was reported, what the photo check found, what officers recorded. Use it at handover. A person reviews it.',
  'room.whatif': 'What-if fire spread|Sketch how a fire might spread with the wind and terrain. A planning aid, labelled as an estimate.',
  'field.tasks': 'Today’s tasks|Place, priority and status for every assignment.',
  'field.offline': 'Works without signal|Map areas are saved for offline use, and notes and photos wait until the phone is online.',
  'field.record': 'Record what you find|Observations and photos go straight onto the incident timeline.',
};

/** What the product does, stated plainly and grouped by who uses it. Every line is something the app does today. */
export function Features() {
  const { t } = useTranslation();
  const line = (group: string, id: string) => {
    const [title, body] = DEFAULTS[`${group}.${id}`].split('|');
    return { title: t(`landing.v2.${group}.${id}.title`, title), body: t(`landing.v2.${group}.${id}.body`, body) };
  };
  return (
    <section id="features" aria-labelledby="features-title" className="scroll-mt-20 space-y-8">
      <div className="max-w-2xl">
        <h2 id="features-title" className="text-3xl md:text-4xl">{t('landing.v2.features_title', 'What TerraWatch does')}</h2>
        <p className="mt-2 text-lg text-ink-muted">{t('landing.v2.features_sub', 'Three groups of people use it, each with their own screens.')}</p>
      </div>
      <div className="grid gap-10 lg:grid-cols-3">
        {GROUPS.map(group => (
          <div key={group.id} className="min-w-0">
            <h3 className="border-b-4 border-ink pb-2 text-2xl">{t(`landing.v2.group.${group.id}`, group.id === 'people' ? 'For people near a fire' : group.id === 'room' ? 'For the Control Room' : 'For Range Officers')}</h3>
            <ul className="divide-y divide-line">
              {group.items.map(({ id, Icon }) => {
                const { title, body } = line(group.id, id);
                return (
                  <li key={id} className="flex gap-4 py-4">
                    <Icon aria-hidden="true" className="mt-1 shrink-0 text-action" size={26} strokeWidth={1.75} />
                    <div className="min-w-0"><p className="text-lg font-bold leading-snug">{title}</p><p className="mt-1 text-ink-muted">{body}</p></div>
                  </li>
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
  ['people_decide', 'People move a report up, software only suggests', 'A report climbs from signal to closed only when a person decides. Model output never changes status, assignment or dispatch.'],
  ['public_delay', 'The public sees less, and later', 'Unchecked reports, names and exact places are never public. A verified fire appears only as a coarse area, after a delay.'],
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
          <li key={id}><p className="text-xl font-bold leading-snug">{t(`landing.v2.rules.${id}.title`, title)}</p><p className="mt-2 opacity-80">{t(`landing.v2.rules.${id}.body`, body)}</p></li>
        ))}
      </ul>
    </section>
  );
}
