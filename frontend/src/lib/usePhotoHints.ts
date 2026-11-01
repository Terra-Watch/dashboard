import { useEffect, useState } from 'react';
import { analyzePhoto, type Hint } from './photoCoach';

/** Hints for each picked photo, in the same order. They arrive a moment after the photo is picked. */
export function usePhotoHints(photos: File[]): Hint[][] {
  const [hints, setHints] = useState<Map<File, Hint[]>>(new Map());
  useEffect(() => {
    let cancelled = false;
    for (const photo of photos) {
      if (hints.has(photo)) continue;
      void analyzePhoto(photo).then(found => { if (!cancelled) setHints(current => new Map(current).set(photo, found)); });
    }
    return () => { cancelled = true; };
  }, [photos]); // eslint-disable-line react-hooks/exhaustive-deps
  return photos.map(photo => hints.get(photo) ?? []);
}
