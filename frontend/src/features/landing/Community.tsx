import { Bell, FileSearch, Flag, MessagesSquare, Newspaper, PenLine, ShieldCheck, type LucideIcon } from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslation } from 'react-i18next';

const SPACES: Array<{ id: string; Icon: LucideIcon; title: string; kicker: string; body: string; points: string[] }> = [
  { id: 'notices', Icon: Newspaper, title: 'Notices', kicker: 'Official, read only', body: 'News from the forest department. One person writes a notice and a second person approves it before anyone sees it.', points: ['Closures, warnings and safety advice', 'Only staff can post here'] },
  { id: 'discussion', Icon: MessagesSquare, title: 'Discussion', kicker: 'Questions and local knowledge', body: 'A moderated board for neighbours. Post, reply and mark what helped.', points: ['Question, local information (not verified) or thanks', 'Write in English, Hindi or Odia', 'Replies and a “helpful” mark'] },
  { id: 'rooms', Icon: Bell, title: 'Chat rooms', kicker: 'One room per region', body: 'Quick, short messages with people in your own region, kept apart from other regions.', points: ['Moderators can slow a room down or freeze it', 'Old messages expire after a set time'] },
];
const POSTING: Array<{ id: string; Icon: LucideIcon; title: string; text: string }> = [
  { id: 'write', Icon: PenLine, title: 'Write', text: 'Choose a topic and write up to 2,000 characters. Add a photo if it helps.' },
  { id: 'review', Icon: FileSearch, title: 'Held if it needs a look', text: 'Phone numbers, links and coordinates wait for a moderator before they appear.' },
  { id: 'report', Icon: Flag, title: 'Report anything wrong', text: 'Anyone can report a post. Moderators can remove it or mute the author.' },
];

/** How the citizen community is split into spaces, how posting works and how photos are checked. */
export function Community() {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const fade = (index: number) => ({ initial: reduce ? false as const : { opacity: 0, y: 20 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-40px' }, transition: { duration: 0.45, delay: index * 0.1, ease: 'easeOut' as const } });
  return (
    <section id="community" aria-labelledby="community-title" className="scroll-mt-20 space-y-10">
      <div className="max-w-2xl">
        <p className="text-sm font-bold uppercase tracking-wide text-action">{t('landing.v3.community_kicker', 'Community')}</p>
        <h2 id="community-title" className="mt-2 text-3xl md:text-4xl">{t('landing.v3.community_title', 'Talk with people near the forest, in three separate spaces')}</h2>
        <p className="mt-2 text-lg text-ink-muted">{t('landing.v3.community_sub', 'Official news, questions and quick chat stay apart, so nothing important gets lost. To report a fire, use Report: posts here never alert responders.')}</p>
      </div>

      <ul className="grid gap-4 md:grid-cols-3">
        {SPACES.map(({ id, Icon, title, kicker, body, points }, index) => (
          <motion.li key={id} {...fade(index)} className="group flex flex-col rounded-2xl border border-line bg-surface p-5 transition duration-200 hover:-translate-y-1 hover:shadow-md">
            <span className="flex size-12 items-center justify-center rounded-full bg-action-tint text-action transition-transform duration-200 group-hover:scale-110"><Icon aria-hidden="true" size={24} strokeWidth={1.75} /></span>
            <p className="mt-4 text-xl font-bold">{t(`landing.v3.space.${id}.title`, title)}</p>
            <p className="text-sm font-bold uppercase tracking-wide text-ink-muted">{t(`landing.v3.space.${id}.kicker`, kicker)}</p>
            <p className="mt-2 text-ink-muted">{t(`landing.v3.space.${id}.body`, body)}</p>
            <ul className="mt-3 space-y-1.5">{points.map((point, i) => <li key={point} className="flex gap-3"><span aria-hidden="true" className="mt-2.5 size-2 shrink-0 rounded-full bg-action" /><span>{t(`landing.v3.space.${id}.p${i + 1}`, point)}</span></li>)}</ul>
          </motion.li>
        ))}
      </ul>

      <div className="grid items-start gap-8 lg:grid-cols-2 lg:gap-14">
        <div>
          <h3 className="text-2xl md:text-3xl">{t('landing.v3.posting_title', 'How posting works')}</h3>
          <ol className="mt-4 divide-y divide-line">
            {POSTING.map(({ id, Icon, title, text }, index) => (
              <motion.li key={id} {...fade(index)} className="flex gap-4 py-4">
                <Icon aria-hidden="true" className="mt-1 shrink-0 text-action" size={26} strokeWidth={1.75} />
                <div><p className="text-lg font-bold leading-snug">{t(`landing.v3.posting.${id}.title`, title)}</p><p className="mt-1 text-ink-muted">{t(`landing.v3.posting.${id}.text`, text)}</p></div>
              </motion.li>
            ))}
          </ol>
        </div>

        <motion.div {...fade(1)} className="rounded-2xl border border-line bg-surface p-6">
          <span className="flex size-12 items-center justify-center rounded-full bg-ok-tint text-ink"><ShieldCheck aria-hidden="true" size={24} strokeWidth={1.75} /></span>
          <h3 className="mt-4 text-2xl md:text-3xl">{t('landing.v3.auth_title', 'Photos are checked for authenticity')}</h3>
          <p className="mt-2 text-lg text-ink-muted">{t('landing.v3.auth_body', 'Every photo is checked for signs that it was edited, made by AI or reused from somewhere else, before other people see it.')}</p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {[['edited', 'Possibly edited'], ['ai', 'Possibly AI-made'], ['reused', 'Reused picture'], ['clear', 'No concern found']].map(([id, label]) => <li key={id} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-sm font-semibold">{t(`landing.v3.auth.${id}`, label)}</li>)}
          </ul>
          <p className="mt-4 text-ink-muted">{t('landing.v3.auth_note', 'Anything that raises a concern is held for a moderator. “No concern found” is not proof that a photo is real or where it was taken, so a person always makes the final call.')}</p>
        </motion.div>
      </div>
    </section>
  );
}
