import { LogOut } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router';
import { Brand } from '../components/Brand';
import { ConnectionChip } from './ConnectionChip';
import { Inbox } from './Inbox';
import { NavIcon } from './Icon';
import { LanguageMenu } from './LanguageMenu';
import { ThemeMenu } from './ThemeMenu';
import { NAV, activeItem, homePath, type NavItem, type ProductRole } from './nav';

type Props = { role: ProductRole; userName?: string; pending?: number; onSignOut: () => void; topSlot?: ReactNode; children: ReactNode };

/** One shell for all three roles. Phones: bottom bar with the primary action raised in the middle. Control Room desktop: left rail. */
export function AppShell({ role, userName, pending = 0, onSignOut, topSlot, children }: Props) {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const main = useRef<HTMLElement>(null);
  const items = NAV[role];
  const current = activeItem(role, pathname);
  const rail = role === 'control_room';

  // After each navigation move focus to the page so keyboard and screen-reader users start at the top of the new view.
  useEffect(() => { main.current?.focus({ preventScroll: true }); window.scrollTo?.(0, 0); }, [pathname]);

  return (
    <div data-rq-app data-role={role} className="min-h-screen bg-canvas text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-rq focus:bg-action focus:px-4 focus:py-2 focus:text-on-action">{t('app.skip')}</a>
      <header className="sticky top-0 z-30 flex min-h-14 items-center gap-3 border-b border-line bg-surface px-4">
        <Link to={homePath(role)} aria-label={t('app.name')} className="shrink-0"><Brand /></Link>
        {!rail && <DesktopNav items={items} currentId={current?.id} label={t('app.menu')} />}
        <div className="ml-auto flex items-center gap-2">
          {topSlot}
          <ConnectionChip pending={pending} />
          {role !== 'citizen' && <Inbox role={role} />}
          <span className="hidden sm:inline-flex"><LanguageMenu /></span>
          <ThemeMenu />
          <button type="button" onClick={onSignOut} className="inline-flex min-h-11 items-center gap-1.5 rounded-rq border border-control bg-surface px-3 text-sm font-semibold hover:bg-surface-2" title={userName}>
            <LogOut aria-hidden="true" size={18} strokeWidth={1.75} /><span className="hidden md:inline">{t('app.signout')}</span>
          </button>
        </div>
      </header>

      <div className={rail ? 'md:grid md:grid-cols-[13rem_1fr]' : ''}>
        {rail && (
          <nav aria-label={t('app.menu')} className="hidden border-r border-line bg-surface md:block">
            <ul className="sticky top-14 flex flex-col gap-1 p-3">
              {items.map(item => (
                <li key={item.id}>
                  <Link to={item.path} aria-current={current?.id === item.id ? 'page' : undefined}
                    className={`flex min-h-11 items-center gap-3 rounded-rq px-3 text-base font-semibold ${current?.id === item.id ? 'bg-action text-on-action' : 'text-ink hover:bg-surface-2'}`}>
                    <NavIcon id={item.icon} size={20} />{t(item.labelKey)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
        <main id="main" ref={main} tabIndex={-1} className="min-w-0 px-4 pb-28 pt-6 outline-none md:px-8 md:pb-10">{children}</main>
      </div>

      <nav aria-label={t('app.menu')} className={`fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] ${rail ? 'md:hidden' : 'md:hidden'}`}>
        <ul className="mx-auto grid max-w-xl items-end" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
          {items.map(item => <li key={item.id}><BottomItem item={item} active={current?.id === item.id} label={t(item.labelKey)} /></li>)}
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
              className={`inline-flex min-h-11 items-center gap-2 rounded-rq px-3 text-base font-semibold ${currentId === item.id ? 'bg-action text-on-action' : item.primary ? 'border border-control text-ink hover:bg-surface-2' : 'text-ink hover:bg-surface-2'}`}>
              <NavIcon id={item.icon} size={18} />{t(item.labelKey)}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
