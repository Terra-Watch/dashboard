/** The browser fires `beforeinstallprompt` once, early. Catch it at start-up so a screen that opens later can still offer "Install". */
type Prompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
let deferred: Prompt | null = null;
const listeners = new Set<() => void>();
const tell = () => listeners.forEach(listener => listener());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event as Prompt; tell(); });
  window.addEventListener('appinstalled', () => { deferred = null; tell(); });
}

export const subscribeInstall = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const canInstall = () => deferred !== null;
export async function install(): Promise<void> { const event = deferred; if (!event) return; deferred = null; tell(); await event.prompt(); await event.userChoice.catch(() => undefined); }
export const isInstalled = () => typeof window !== 'undefined' && (window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
export const isIos = () => typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);
