import * as Tabs from '@radix-ui/react-tabs';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NavIcon } from '../../ui/Icon';
import { NAV, type ProductRole } from '../../ui/nav';

const ROLES: ProductRole[] = ['citizen', 'control_room', 'field'];

/** Each role's real navigation, rendered from the same data the product uses, so the page cannot drift from the app. */
export function RoleExplorer() {
  const { t } = useTranslation();
  const [role, setRole] = useState<ProductRole>('citizen');
  return (
    <section aria-labelledby="roles-title" className="rounded-panel border border-line bg-surface p-5 md:p-8" data-testid="role-explorer">
      <h2 id="roles-title" className="text-2xl md:text-3xl">{t('landing.roles.title')}</h2>
      <Tabs.Root value={role} onValueChange={value => setRole(value as ProductRole)} className="mt-5">
        <Tabs.List aria-label={t('landing.roles.title')} className="flex flex-wrap gap-2">
          {ROLES.map(item => (
            <Tabs.Trigger key={item} value={item} className="min-h-11 rounded-rq border border-control px-4 text-base font-semibold data-[state=active]:border-action data-[state=active]:bg-action data-[state=active]:text-on-action hover:bg-surface-2">
              {t(`landing.roles.${item}.name`)}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        {ROLES.map(item => <Tabs.Content key={item} value={item} className="mt-5 outline-none"><RolePanel role={item} /></Tabs.Content>)}
      </Tabs.Root>
    </section>
  );
}

function RolePanel({ role }: { role: ProductRole }) {
  const { t } = useTranslation();
  const reduce = useReducedMotion();
  const items = NAV[role];
  const [selected, setSelected] = useState(items.find(item => item.primary)?.id ?? items[0].id);
  const current = items.find(item => item.id === selected) ?? items[0];
  const rail = role === 'control_room';
  return (
    <div className="grid gap-6 md:grid-cols-[1fr_20rem] md:items-start">
      <div>
        <p className="text-lg text-ink-muted">{t(`landing.roles.${role}.tagline`)}</p>
        <ul className="mt-4 space-y-2">
          {items.map(item => (
            <li key={item.id}>
              <button type="button" onClick={() => setSelected(item.id)} aria-pressed={item.id === selected}
                className={`flex w-full items-start gap-3 rounded-rq border p-3 text-left ${item.id === selected ? 'border-action bg-action-tint' : 'border-line hover:bg-surface-2'}`}>
                <span className="mt-0.5 shrink-0"><NavIcon id={item.icon} size={22} /></span>
                <span><span className="block font-bold">{t(item.labelKey)}</span><span className="block text-ink-muted">{t(`landing.roles.${role}.${item.id.replace('-', '_')}`)}</span></span>
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-sm text-ink-muted">{t('landing.roles.hint')}</p>
      </div>
      <div aria-hidden="true" className={`mx-auto w-full overflow-hidden rounded-[1.5rem] border-4 border-ink bg-canvas ${rail ? 'max-w-80' : 'max-w-64'}`}>
        <div className={rail ? 'grid grid-cols-[6.5rem_1fr]' : 'flex min-h-72 flex-col'}>
          {rail && (
            <ul className="space-y-1 border-r border-line bg-surface p-2">
              {items.map(item => <li key={item.id} className={`flex items-center gap-1.5 rounded-rq px-2 py-1.5 text-xs font-semibold ${item.id === selected ? 'bg-action text-on-action' : ''}`}><NavIcon id={item.icon} size={14} />{t(item.labelKey)}</li>)}
            </ul>
          )}
          <div className={`flex flex-1 flex-col items-center justify-center gap-3 p-5 text-center ${rail ? 'min-h-72' : ''}`}>
            <AnimatePresence mode="wait">
              <motion.div key={current.id} initial={reduce ? false : { opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={reduce ? undefined : { opacity: 0 }} transition={{ duration: 0.16 }} className="flex flex-col items-center gap-2">
                <span className="flex size-14 items-center justify-center rounded-full bg-action text-on-action"><NavIcon id={current.icon} size={28} /></span>
                <span className="text-lg font-bold">{t(current.labelKey)}</span>
              </motion.div>
            </AnimatePresence>
          </div>
          {!rail && (
            <ul className="grid border-t border-line bg-surface" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
              {items.map(item => <li key={item.id} className={`flex flex-col items-center gap-0.5 py-2 text-[0.65rem] ${item.id === selected ? 'font-bold text-ink' : 'text-ink-muted'}`}><NavIcon id={item.icon} size={16} />{t(item.labelKey)}</li>)}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
