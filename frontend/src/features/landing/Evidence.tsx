import { useTranslation } from 'react-i18next';

const TILES: Array<[string, string, string]> = [
  ['states', '17', 'states in the daily forecast, with 7,148 forest cells ranked each day'],
  ['fires', '2,930', 'forest fires from 25 states studied for how they spread'],
  ['tested', '250', 'fires from 2025 the spread model had never seen: its top cells overlapped what burned 1.9 times as often as simply choosing the cells nearest the fire'],
];

/** The numbers behind the claims, each one measured on data the model did not train on. */
export function Evidence() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="evidence-title" className="space-y-6">
      <h2 id="evidence-title" className="text-3xl md:text-4xl">{t('landing.v4.evidence_title', 'Tested before it is shown')}</h2>
      <ul className="grid gap-4 md:grid-cols-3">
        {TILES.map(([id, value, body]) => (
          <li key={id} className="rounded-2xl border border-line bg-surface p-5"><p className="text-4xl font-bold text-action">{t(`landing.v4.evidence.${id}.value`, value)}</p><p className="mt-2 text-ink-muted">{t(`landing.v4.evidence.${id}.body`, body)}</p></li>
        ))}
      </ul>
      <p className="max-w-3xl text-sm text-ink-muted">{t('landing.v4.evidence_note', 'The forecast was tested on the 2025 fire season, and the spread outlook on 2025 fires and on three states held out of training. The truth is satellite data, not a field-checked map. Both are rankings that help staff decide where to look; neither is a promise.')}</p>
    </section>
  );
}
