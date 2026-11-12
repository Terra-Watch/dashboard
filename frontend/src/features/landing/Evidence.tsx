import { useTranslation } from 'react-i18next';

const TILES: Array<[string, string, string]> = [
  ['states', '17', 'states, with 7,148 forest cells scored for the next day'],
  ['extreme', '81%', 'of area-days rated Extreme in 2025 had a detected fire, against 0.7% of unrated ones'],
  ['spread', '75%', 'of the cells that burned lay in the top band of the spread outlook (median over 244 test fires of 2025), against 50% for picking the cells nearest the fire'],
  ['network', '95 to 98%', 'of station reports still arrive after the busiest relay fails, in simulation'],
];

/** The numbers behind the claims, each one measured on data the model did not train on or in simulation. */
export function Evidence() {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="evidence-title" className="space-y-6">
      <h2 id="evidence-title" className="text-3xl md:text-4xl">{t('landing.v4.evidence_title', 'Tested before it is shown')}</h2>
      <ul className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {TILES.map(([id, value, body]) => (
          <li key={id} className="rounded-2xl border border-line bg-surface p-5"><p className="text-4xl font-bold text-action">{t(`landing.v5.evidence.${id}.value`, value)}</p><p className="mt-2 text-ink-muted">{t(`landing.v5.evidence.${id}.body`, body)}</p></li>
        ))}
      </ul>
      <p className="max-w-3xl text-sm text-ink-muted">{t('landing.v5.evidence_note', 'The forecast and the spread outlook were tested on 2025, a year the models were not trained on; the network figure comes from simulation. The truth is satellite data, not a field-checked map. The forecast and the outlook are rankings that help staff decide where to look; neither is a promise.')}</p>
    </section>
  );
}
