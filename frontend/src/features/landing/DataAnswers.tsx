import * as Accordion from '@radix-ui/react-accordion';
import { ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function DataAnswers() {
  const { t } = useTranslation();
  return (
    <section id="privacy" aria-labelledby="data-title" className="scroll-mt-20">
      <h2 id="data-title" className="text-2xl md:text-3xl">{t('landing.data.title')}</h2>
      <Accordion.Root type="single" collapsible className="mt-5 divide-y divide-line rounded-panel border border-line bg-surface">
        {(['1', '2'] as const).map(n => (
          <Accordion.Item key={n} value={n}>
            <Accordion.Header>
              <Accordion.Trigger className="group flex min-h-14 w-full items-center justify-between gap-3 px-5 text-left text-lg font-semibold">
                {t(`landing.data.q${n}`)}<ChevronDown aria-hidden="true" size={20} className="shrink-0 transition-transform group-data-[state=open]:rotate-180" />
              </Accordion.Trigger>
            </Accordion.Header>
            <Accordion.Content className="px-5 pb-5 text-ink-muted">{t(`landing.data.a${n}`)}</Accordion.Content>
          </Accordion.Item>
        ))}
      </Accordion.Root>
    </section>
  );
}
