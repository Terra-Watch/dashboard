import { useEffect, useState } from 'react';
import { incidentImageUrl } from '../../lib/api';

export type EvidenceImageState = { status: 'loading' } | { status: 'ready'; url: string } | { status: 'error' };

/** Loads a protected evidence photo with the user's credentials and frees the object URL on unmount. */
export function useEvidenceImage(incidentId: number, imageId: number): { state: EvidenceImageState; retry: () => void } {
  const [state, setState] = useState<EvidenceImageState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined;
    setState({ status: 'loading' });
    incidentImageUrl(incidentId, imageId)
      .then(url => {
        if (cancelled) { URL.revokeObjectURL(url); return; }
        objectUrl = url;
        setState({ status: 'ready', url });
      })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [incidentId, imageId, attempt]);
  return { state, retry: () => setAttempt(count => count + 1) };
}
