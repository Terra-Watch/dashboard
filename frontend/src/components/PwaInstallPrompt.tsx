import { useEffect, useState } from 'react';

interface DeferredInstallPrompt extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISSED_KEY = 'terrawatch_pwa_install_dismissed_v1';

function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isAppleMobile(): boolean {
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PwaInstallPrompt() {
  const [prompt, setPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone() || localStorage.getItem(DISMISSED_KEY) === '1') return;
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setPrompt(event as DeferredInstallPrompt);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);
    if (isAppleMobile()) setShowIosHint(true);
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, []);

  if (!prompt && !showIosHint) return null;

  function dismiss() {
    localStorage.setItem(DISMISSED_KEY, '1');
    setPrompt(null);
    setShowIosHint(false);
  }

  async function install() {
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    dismiss();
  }

  return (
    <aside className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-rq border border-contour bg-sheet p-4 shadow-lg" aria-label="Install TerraWatch">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink">Keep TerraWatch close at hand</p>
          {prompt ? <p className="mt-1 text-sm text-ink-muted">Install the public information and field workspace for quicker access.</p> : <p className="mt-1 text-sm text-ink-muted">On iPhone or iPad, use Share, then “Add to Home Screen”.</p>}
        </div>
        <button type="button" onClick={dismiss} className="min-h-[44px] px-2 text-sm text-ink-muted underline" aria-label="Dismiss install prompt">Dismiss</button>
      </div>
      {prompt && <button type="button" onClick={() => void install()} className="mt-3 min-h-[44px] w-full rounded-rq bg-canopy px-4 py-2 text-sm font-semibold text-white">Install TerraWatch</button>}
    </aside>
  );
}
