import { Camera, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { rosePoint } from '../../lib/heading';
import { PHOTO_MAX_SIDE, fitWithin } from '../../lib/photo';
import { Button } from '../../ui/Button';

export type Capture = { file: File; capturedAt: string; heading: number | null };

/** The camera, live, inside the page. There is no way to pick a file from the gallery here: a photo can only be one the phone takes now. The direction the phone points is read at the moment of capture. */
export function LiveCamera({ heading, liveHeading, blocked, hint, onCapture, onClose }: { heading?: () => number | null; liveHeading?: number | null; blocked?: boolean; hint?: string; onCapture: (c: Capture) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const video = useRef<HTMLVideoElement>(null);
  const [problem, setProblem] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null, cancelled = false;
    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) { setProblem(t('citizen.camera.none', 'This browser cannot open the camera here. Open the page over a secure (https) connection.')); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } }, audio: false });
        if (cancelled) { stream.getTracks().forEach(track => track.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play().catch(() => undefined); setReady(true); }
      } catch { setProblem(t('citizen.camera.denied', 'The camera is blocked. Allow camera access for this site in your browser settings, then try again.')); }
    })();
    return () => { cancelled = true; stream?.getTracks().forEach(track => track.stop()); };
  }, [t]);

  async function take() {
    const el = video.current;
    if (!el || !el.videoWidth) return;
    const { width, height } = fitWithin(el.videoWidth, el.videoHeight, PHOTO_MAX_SIDE);
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    canvas.getContext('2d')?.drawImage(el, 0, 0, width, height);
    const aim = heading ? heading() : null;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob) { setProblem(t('citizen.camera.failed', 'The photo could not be taken. Try again.')); return; }
    onCapture({ file: new File([blob], 'photo.jpg', { type: 'image/jpeg' }), capturedAt: new Date().toISOString(), heading: aim });
  }

  return (
    <div role="dialog" aria-modal="true" aria-label={t('citizen.camera.title', 'Camera')} className="fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center justify-between gap-3 p-3">
        <p aria-live="polite" className="text-sm">{!heading ? '' : liveHeading == null ? (blocked ? t('citizen.camera.blocked_compass', 'The compass is blocked. Allow motion sensors for this site, or pick the direction yourself afterwards.') : t('citizen.camera.no_compass', 'Compass not available: you will pick the direction yourself.'))
          : t('citizen.camera.facing', { point: rosePoint(liveHeading), deg: Math.round(liveHeading), defaultValue: 'Facing {{point}} ({{deg}}°)' })}</p>
        <button type="button" onClick={onClose} aria-label={t('citizen.camera.close', 'Close the camera')} className="flex size-11 items-center justify-center rounded-full bg-white/15"><X aria-hidden="true" size={22} /></button>
      </div>
      <div className="relative min-h-0 flex-1">
        <video ref={video} playsInline muted autoPlay className="size-full object-cover" />
        {!problem && hint && <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-sm drop-shadow">{hint}</p>}
        {problem && <p role="alert" className="absolute inset-x-4 top-1/3 rounded-xl bg-black/70 p-4 text-center">{problem}</p>}
      </div>
      <div className="flex justify-center p-5">
        <Button onClick={() => void take()} disabled={!ready || Boolean(problem)} icon={<Camera aria-hidden="true" size={22} />} className="min-h-14 px-8 text-lg">{t('citizen.camera.take', 'Take photo')}</Button>
      </div>
    </div>
  );
}
