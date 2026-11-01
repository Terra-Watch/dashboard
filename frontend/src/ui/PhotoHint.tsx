import { useTranslation } from 'react-i18next';
import type { Hint } from '../lib/photoCoach';

const TEXT: Record<Hint, string> = {
  soft: 'This photo may be blurry or hazy. If it is blurry, hold the phone steady and take it again. You can still send it.',
  dark: 'This photo is very dark. If it is safe, take another where there is more light. You can still send it.',
  bright: 'This photo is very bright. Try again with the sun behind you. You can still send it.',
  small: 'This photo is small. A larger photo helps staff see more. You can still send it.',
};

/** What the picture itself looks like, never what is in it. Always ends with "you can still send it". */
export function PhotoHint({ hints }: { hints: Hint[] }) {
  const { t } = useTranslation();
  if (!hints.length) return null;
  return <ul className="mt-1 space-y-1 text-sm text-ink-muted">{hints.map(hint => <li key={hint}>{t(`photo.hint.${hint}`, TEXT[hint])}</li>)}</ul>;
}
