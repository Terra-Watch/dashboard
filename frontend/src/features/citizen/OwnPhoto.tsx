import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authorizedImageUrl } from '../../lib/api';

/** One of the signed-in citizen's own report photos. Fetched with their sign-in; the server never shows it to anyone else through this route. */
export function OwnPhoto({ reportId, imageId, className = '' }: { reportId: number; imageId: number; className?: string }) {
  const { t } = useTranslation();
  const [state, setState] = useState<{ status: 'loading' } | { status: 'ready'; url: string } | { status: 'error' }>({ status: 'loading' });
  useEffect(() => {
    let cancelled = false; let objectUrl: string | undefined;
    setState({ status: 'loading' });
    authorizedImageUrl(`/api/citizen/reports/${reportId}/evidence/${imageId}`)
      .then(url => { if (cancelled) { URL.revokeObjectURL(url); return; } objectUrl = url; setState({ status: 'ready', url }); })
      .catch(() => { if (!cancelled) setState({ status: 'error' }); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [reportId, imageId]);
  if (state.status === 'ready') return <img src={state.url} alt={t('citizen.photo.yours', 'A photo you sent with this report')} className={`rounded-lg border border-line object-cover ${className}`} />;
  return <div role={state.status === 'error' ? 'alert' : 'status'} className={`flex items-center justify-center rounded-lg border border-line bg-surface-2 p-2 text-center text-sm text-ink-muted ${className}`}>{state.status === 'loading' ? t('citizen.photo.loading', 'Loading photo…') : t('citizen.photo.failed', 'Photo could not be shown')}</div>;
}
