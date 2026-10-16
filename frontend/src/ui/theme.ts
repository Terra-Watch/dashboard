export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'tw_theme';

export function readTheme(): ThemeChoice {
  try { const value = localStorage.getItem(KEY); return value === 'light' || value === 'dark' ? value : 'system'; } catch { return 'system'; }
}

/** `system` removes the override so the palette follows prefers-color-scheme. */
export function applyTheme(choice: ThemeChoice, announce = true): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', choice);
  try { if (choice === 'system') localStorage.removeItem(KEY); else localStorage.setItem(KEY, choice); } catch { /* private mode: the choice just lasts this visit */ }
  if (announce) window.dispatchEvent(new Event('tw-theme'));   // lets the map redraw in the new colours
}
