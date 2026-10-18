import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, Languages } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LANGUAGES } from './i18n/locales';

export function LanguageMenu() {
  const { t, i18n } = useTranslation();
  const current = (i18n.resolvedLanguage || 'en').slice(0, 2);
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={t('app.language')} className="inline-flex min-h-11 items-center gap-1.5 rounded-rq border border-control bg-surface px-3 text-sm font-semibold text-ink hover:bg-surface-2 active:scale-[0.98]">
        <Languages aria-hidden="true" size={18} strokeWidth={1.75} />
        <span className="hidden sm:inline">{LANGUAGES.find(language => language.code === current)?.label ?? 'English'}</span>
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content forceMount align="end" sideOffset={6} className="rq-menu-content z-50 min-w-40 rounded-panel border border-control bg-surface p-1 text-ink shadow-lg" data-rq-app>
          {LANGUAGES.map(language => (
            <Menu.Item key={language.code} onSelect={() => void i18n.changeLanguage(language.code)} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-rq px-3 text-base outline-none data-[highlighted]:bg-action-tint">
              <span lang={language.code}>{language.label}</span>
              {current === language.code && <Check aria-hidden="true" size={16} />}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
