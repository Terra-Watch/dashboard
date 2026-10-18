import { LogOut, Menu, MoreHorizontal } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { Brand } from '../components/Brand';
import { ConnectionChip } from './ConnectionChip';
import { Inbox } from './Inbox';
import { NavIcon } from './Icon';
import { LanguageMenu } from './LanguageMenu';
import { ThemeMenu } from './ThemeMenu';
import { useOpsSettings } from '../features/ops/useOps';
import { navFor, activeItem, homePath, type NavItem, type ProductRole } from './nav';

type Props = { role: ProductRole; userName?: string; pending?: number; onSignOut: () => void; topSlot?: ReactNode; children: ReactNode };

/** One shell for all three roles. Phones: bottom bar with the primary action raised in the middle. Control Room desktop: left rail. */
export function AppShell({ role, userName, pending = 0, onSignOut, topSlot, children }: Props) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  // The what-if page is listed for the Control Room only, and only while the Scenario setting is on (same rule as the Scenario tab).
  const settings = useOpsSettings(role === 'control_room');
  const items = navFor(role, { scenario: role === 'control_room' && settings.data?.scenario_enabled === true });
  const current = activeItem(role, pathname);
  const rail = role === 'control_room';
  const [railOpen, setRailOpen] = useState(true);
  const [railHovered, setRailHovered] = useState(false);
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const railExpanded = railOpen || railHovered;
  const mobileOverflow = rail ? items.filter(item => item.id === 'handover' || item.id === 'whatif') : [];
  const mobileItems = mobileOverflow.length ? [...items.filter(item => !mobileOverflow.some(hidden => hidden.id === item.id)).slice(0, 4)] : items;
  const mobileMoreActive = mobileOverflow.some(item => item.id === current?.id);

  // After each navigation move focus to the page so keyboard and screen-reader users start at the top of the new view.
  useEffect(() => { main.current?.focus({ preventScroll: true }); window.scrollTo?.(0, 0); }, [pathname]);

  return (
    <div data-rq-app data-role={role} className="min-h-screen bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-rq focus:bg-action focus:px-4 focus:py-2 focus:text-on-action">{t('app.skip')}</a>
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4">
        {rail && <button type="button" onClick={() => setRailOpen(value => !value)} aria-expanded={railExpanded} aria-controls="control-room-sidebar" aria-label={railExpanded ? t('app.close_menu', 'Close menu') : t('app.open_menu', 'Open menu')} className="inline-flex size-11 shrink-0 items-center justify-center rounded-rq border border-control bg-surface hover:bg-surface-2 active:scale-95"><Menu aria-hidden="true" size={20} /></button>}
        <Link to={homePath(role)} aria-label={t('app.name')} className="shrink-0"><Brand /></Link>
        {!rail && <DesktopNav items={items} currentId={current?.id} label={t('app.menu')} />}
        <div className="ml-auto flex items-center gap-2">
          {topSlot}
          <ConnectionChip pending={pending} />
          <Inbox role={role} />
          <span className="hidden sm:inline-flex"><LanguageMenu /></span>
          <ThemeMenu />
          <button type="button" onClick={onSignOut} className="inline-flex min-h-11 items-center gap-1.5 rounded-rq border border-control bg-surface px-3 text-sm font-semibold hover:bg-surface-2 active:scale-[0.98]" title={userName}>
            <LogOut aria-hidden="true" size={18} strokeWidth={1.75} /><span className="hidden md:inline">{t('app.signout')}</span>
          </button>
        </div>
      </header>

      <div className={rail ? 'relative' : ''}>
        {rail && (
          <nav id="control-room-sidebar" aria-label={t('app.menu')} onMouseEnter={() => setRailHovered(true)} onMouseLeave={() => setRailHovered(false)} onFocusCapture={() => setRailHovered(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setRailHovered(false); }} className={`fixed left-0 top-14 z-20 hidden flex-col border-r border-line bg-surface shadow-[2px_0_12px_rgb(15_23_42/0.04)] transition-[width] duration-[350ms] ease-out motion-reduce:transition-none md:flex md:h-[calc(100vh-3.5rem)] md:overflow-y-auto ${railExpanded ? 'w-52 min-w-52' : 'w-[4.5rem] min-w-[4.5rem]'}`}>
            <div className={`sticky top-0 z-10 flex shrink-0 items-center border-b border-line bg-surface px-3 py-2 transition-[height,opacity] duration-[250ms] ${railExpanded ? 'h-11 opacity-100' : 'h-0 overflow-hidden border-b-0 py-0 opacity-0'}`}>
              <span className="truncate text-sm font-semibold">{t('app.menu')}</span>
            </div>
            <ul className={`flex flex-col gap-1 p-3 ${railExpanded ? '' : 'items-center'}`}>
              {items.map(item => (
                <li key={item.id}>
                  <Link to={item.path} aria-current={current?.id === item.id ? 'page' : undefined}
                    title={railExpanded ? undefined : t(item.labelKey)}
                    className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-base font-semibold leading-none ${railExpanded ? '' : 'justify-center px-0'} ${current?.id === item.id ? 'bg-action-tint text-action' : 'text-ink hover:bg-surface-2'}`}>
                    <span className="flex w-6 shrink-0 items-center justify-center"><NavIcon id={item.icon} size={20} /></span><span className={`truncate overflow-hidden transition-[opacity,width] duration-[250ms] ${railExpanded ? 'w-auto opacity-100' : 'w-0 opacity-0'}`}>{t(item.labelKey)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <main id="main" ref={main} tabIndex={-1} className={`min-w-0 px-4 pb-28 pt-6 outline-none md:px-8 md:pb-10 ${rail ? 'md:pl-[14.5rem]' : ''}`}>{children}</main>
      </div>

      {mobileOverflow.length > 0 && <div aria-hidden={!mobileMoreOpen} inert={!mobileMoreOpen} data-open={mobileMoreOpen ? 'true' : 'false'} className={`rq-popover fixed inset-x-3 bottom-20 z-40 rounded-xl border border-line bg-surface p-2 shadow-[0_12px_32px_rgb(15_23_42/0.12)] md:hidden ${mobileMoreOpen ? 'rq-popover-open' : 'rq-popover-closed pointer-events-none'}`}>
        <ul className="grid gap-1">
          {mobileOverflow.map(item => <li key={item.id}><Link to={item.path} onClick={() => setMobileMoreOpen(false)} aria-current={current?.id === item.id ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-rq px-3 font-semibold ${current?.id === item.id ? 'bg-action-tint text-action' : 'hover:bg-surface-2'}`}><NavIcon id={item.icon} size={20} />{t(item.labelKey)}</Link></li>)}
        </ul>
      </div>}
      <nav aria-label={t('app.menu')} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto grid max-w-xl items-end" style={{ gridTemplateColumns: `repeat(${mobileItems.length + (mobileOverflow.length ? 1 : 0)}, minmax(0, 1fr))` }}>
          {mobileItems.map(item => <li key={item.id}><BottomItem item={item} active={current?.id === item.id} label={t(item.labelKey)} /></li>)}
          {mobileOverflow.length > 0 && <li><button type="button" aria-expanded={mobileMoreOpen} onClick={() => setMobileMoreOpen(value => !value)} className={`flex min-h-16 w-full flex-col items-center justify-center gap-0.5 text-sm ${mobileMoreActive || mobileMoreOpen ? 'font-bold text-ink' : 'text-ink-muted'}`}><span className={`flex h-8 w-14 items-center justify-center rounded-full ${mobileMoreActive || mobileMoreOpen ? 'bg-action-tint' : ''}`}><MoreHorizontal aria-hidden="true" /></span>{t('app.more', 'More')}</button></li>}
        </ul>
      </nav>
    </div>
  );
}

function BottomItem({ item, active, label }: { item: NavItem; active: boolean; label: string }) {
  if (item.primary) {
    return (
      <Link to={item.path} aria-current={active ? 'page' : undefined} className="relative -mt-5 flex min-h-16 flex-col items-center justify-end gap-0.5 pb-1.5 text-sm font-semibold text-ink">
        <span className="flex size-14 items-center justify-center rounded-full border-4 border-surface bg-action text-on-action shadow-md"><NavIcon id={item.icon} size={26} /></span>
        {label}
      </Link>
    );
  }
  return (
    <Link to={item.path} aria-current={active ? 'page' : undefined} className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm ${active ? 'font-bold text-ink' : 'text-ink-muted'}`}>
      <span className={`flex h-8 w-14 items-center justify-center rounded-full ${active ? 'bg-action-tint' : ''}`}><NavIcon id={item.icon} /></span>
      {label}
    </Link>
  );
}

function DesktopNav({ items, currentId, label }: { items: NavItem[]; currentId?: string; label: string }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={label} className="ml-4 hidden md:block">
      <ul className="flex items-center gap-1">
        {items.map(item => (
          <li key={item.id}>
            <Link to={item.path} aria-current={currentId === item.id ? 'page' : undefined}
              className={`inline-flex min-h-11 items-center gap-2 rounded-rq px-3 text-base font-semibold ${currentId === item.id ? 'bg-action-tint text-action' : item.primary ? 'border border-control text-ink hover:bg-surface-2' : 'text-ink hover:bg-surface-2'}`}>
              <NavIcon id={item.icon} size={18} />{t(item.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
