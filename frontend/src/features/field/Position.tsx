import { LocateFixed } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui/Button';

export type Position = { lat: number; lon: number; accuracy: number; at: number };
type Ctx = { position: Position | null; locate: () => void; busy: boolean; problem: string };
const PositionContext = createContext<Ctx>({ position: null, locate: () => undefined, busy: false, problem: '' });

/** Position is taken only when the officer taps, not continuously (battery, privacy). */
export function PositionProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [position, setPosition] = useState<Position | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const locate = useCallback(() => {
    if (!navigator.geolocation) { setProblem(t('field.no_gps', 'This device cannot share its location.')); return; }
    setBusy(true); setProblem('');
    navigator.geolocation.getCurrentPosition(
      result => { setPosition({ lat: result.coords.latitude, lon: result.coords.longitude, accuracy: result.coords.accuracy, at: Date.now() }); setBusy(false); },
      () => { setBusy(false); setProblem(t('field.gps_failed', 'Could not get your position. Check location access.')); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 },
    );
  }, [t]);
  const value = useMemo(() => ({ position, locate, busy, problem }), [position, locate, busy, problem]);
  return <PositionContext.Provider value={value}>{children}</PositionContext.Provider>;
}
export const usePosition = () => useContext(PositionContext);

export function LocateButton() {
  const { t } = useTranslation();
  const { locate, busy, position } = usePosition();
  return <Button variant="secondary" onClick={locate} loading={busy} icon={<LocateFixed aria-hidden="true" size={18} />}>{position ? t('field.update_position', 'Update my position') : t('field.use_position', 'Show distance from me')}</Button>;
}
