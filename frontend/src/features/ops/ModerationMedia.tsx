import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { API } from '../../app/config';
import { getAuthToken } from '../../lib/sessionAuth';
import { presentCommunityAssessment, type CommunityImageAssessment, type CommunityTone } from '../../lib/assessmentPresentation';

export type ModerationImage = { id: number | string; url: string; width?: number | null; height?: number | null };

const TONE_BOX: Record<CommunityTone, string> = {
  concern: 'border-warn bg-warn-tint',
  no_concern: 'border-control bg-canvas',
  inconclusive: 'border-control bg-canvas',
  unavailable: 'border-control bg-canvas',
};

type State = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error' };

/** Loads a protected community image with the moderator's credentials. Credentials are only sent to the API's own origin. */
function useProtectedImage(url: string): { state: State; retry: () => void } {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false; let objectUrl: string | undefined;
    setState({ status: 'loading' });
    void (async () => {
      try {
        const apiOrigin = new URL(API || '/', window.location.href).origin;
        const target = new URL(url, new URL(API || '/', window.location.href));
        if (target.origin !== apiOrigin) throw new Error('foreign origin');
        const headers = new Headers(); const token = await getAuthToken(); if (token) headers.set('Authorization', `Bearer ${token}`);
        const response = await fetch(target.href, { headers, credentials: 'include' });
        if (!response.ok) throw new Error(String(response.status));
        objectUrl = URL.createObjectURL(await response.blob());
        if (cancelled) { URL.revokeObjectURL(objectUrl); return; }
        setState({ status: 'ready', url: objectUrl });
      } catch { if (!cancelled) setState({ status: 'error' }); }
    })();
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url, attempt]);
  return { state, retry: () => setAttempt(n => n + 1) };
}

/** A community image in the moderation queue with its advisory media check. Never uses fire or smoke wording. */
export function ModerationMedia({ image, assessment }: { image: ModerationImage; assessment?: CommunityImageAssessment | null }) {
  const { t } = useTranslation();
  const { state, retry } = useProtectedImage(image.url);
  const p = presentCommunityAssessment(assessment, t);
  return (
    <div className="mt-2 space-y-2" data-testid="moderation-media">
      {state.status === 'loading' && <div className="h-40 animate-pulse rounded-rq bg-line/60" role="status" aria-label={t('ops.moderation.image_loading', 'Loading image')} />}
      {state.status === 'ready' && <img src={state.url} alt={t('ops.moderation.image_alt', 'Image attached to this post')} className="max-h-72 w-full rounded-rq border border-control bg-canvas object-contain" />}
      {state.status === 'error' && (
        <div role="alert" className="rounded-rq border border-control p-3 text-sm">
          <p>{t('ops.moderation.image_failed', 'The image could not be loaded.')}</p>
          <button type="button" onClick={retry} className="mt-2 min-h-11 rounded-rq border border-control px-3 font-semibold text-action">{t('citizen.retry', 'Try again')}</button>
        </div>
      )}
      <div className={`rounded-rq border-l-4 p-3 text-sm ${TONE_BOX[p.tone]}`} data-testid="community-assessment" data-tone={p.tone}>
        <p className="font-semibold">{t('ops.moderation.media_check', 'Image check')}: <span data-testid="community-assessment-status">{p.headline}</span>{p.reason ? ` · ${p.reason}` : ''}</p>
        {p.recommendation && <p className="mt-1">{p.recommendation}</p>}
        {p.indications.length > 0 && <ul className="mt-1 space-y-0.5 text-ink-muted">{p.indications.map(line => <li key={line.key}>{line.label}: {line.value}</li>)}</ul>}
        {p.qualityWarnings.length > 0 && <ul className="mt-1 list-disc pl-5 text-ink-muted">{p.qualityWarnings.map(text => <li key={text}>{text}</li>)}</ul>}
        {p.limitations.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-ink-muted">{p.limitations.map(text => <li key={text}>{text}</li>)}</ul>}
        <p className="mt-1 text-xs text-ink-muted" data-testid="community-advisory">{p.advisoryLine}</p>
      </div>
    </div>
  );
}
