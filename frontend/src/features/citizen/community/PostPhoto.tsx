import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authorizedImageUrl } from '../../../lib/api';

/** The photo on a community post, with a positive-only note about the automatic check. A photo with no mark has simply not been marked; nothing negative is ever said here. */
export function PostPhoto({ url, checked }: { url: string; checked: 'automatic' | 'moderator' | null }) {
  const { t } = useTranslation();
  const [src, setSrc] = useState<string | null>(null); const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false; let objectUrl: string | undefined;
    authorizedImageUrl(url).then(next => { if (cancelled) { URL.revokeObjectURL(next); return; } objectUrl = next; setSrc(next); }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  return (
    <figure className="mt-2">
      {src ? <img src={src} alt={t('citizen.community.photo_alt', 'Photo shared with this post')} className="max-h-80 w-auto max-w-full rounded-lg border border-line object-contain" />
        : <div className="flex h-24 w-40 items-center justify-center rounded-lg border border-line bg-surface-2 text-sm text-ink-muted">{failed ? t('citizen.photo.failed', 'Photo could not be shown') : t('citizen.photo.loading', 'Loading photo…')}</div>}
      {checked && <figcaption className="mt-1 text-sm text-ink-muted">{checked === 'moderator'
        ? t('citizen.community.checked_moderator', 'A moderator looked at this photo.')
        : t('citizen.community.checked_auto', 'Automatic photo check: no sign of editing or AI generation found. This does not prove the photo is real.')}</figcaption>}
    </figure>
  );
}
