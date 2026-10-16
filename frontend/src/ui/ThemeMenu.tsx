import * as Menu from '@radix-ui/react-dropdown-menu';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyTheme, readTheme, type ThemeChoice } from './theme';

const OPTIONS: Array<{ id: ThemeChoice; label: string; Icon: typeof Sun }> = [
  { id: 'system', label: 'System', Icon: Monitor }, { id: 'light', label: 'Light', Icon: Sun }, { id: 'dark', label: 'Dark', Icon: Moon },
];

export function ThemeMenu() {
  const { t } = useTranslation();
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  const Current = OPTIONS.find(option => option.id === choice)!.Icon;
  return (
    <Menu.Root>
      <Menu.Trigger aria-label={t('app.theme')} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-rq border border-control bg-surface text-ink hover:bg-surface-2">
        <Current aria-hidden="true" size={18} strokeWidth={1.75} />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align="end" sideOffset={6} className="z-50 min-w-36 rounded-panel border border-control bg-surface p-1 text-ink shadow-lg" data-rq-app>
          {OPTIONS.map(({ id, label, Icon }) => (
            <Menu.Item key={id} onSelect={() => { setChoice(id); applyTheme(id); }} className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-rq px-3 text-base outline-none data-[highlighted]:bg-action-tint">
              <span className="inline-flex items-center gap-2"><Icon aria-hidden="true" size={16} />{label}</span>
              {choice === id && <Check aria-hidden="true" size={16} />}
            </Menu.Item>
          ))}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}
