import { Camera, ClipboardCheck, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

/** What happens to a report, in three plain steps. Shown beside the sign-in form on a desktop and below it on a phone. */
export function HowItWorksAside() {
  const { t } = useTranslation();
  const steps = [
    { icon: Camera, title: t('citizen.v2.how.report', 'You report'), text: t('citizen.v2.how.report_text', 'Take a photo and tell us what you see. It takes about a minute.') },
    { icon: ClipboardCheck, title: t('citizen.v2.how.check', 'Staff check it'), text: t('citizen.v2.how.check_text', 'A person in the Control Room reviews every report before anything is announced.') },
    { icon: ShieldCheck, title: t('citizen.v2.how.act', 'Responders act'), text: t('citizen.v2.how.act_text', 'You can follow each step of your report from received to closed.') },
  ];
  return (
    <div className="max-w-sm space-y-6">
      <h2 className="text-2xl font-bold leading-snug">{t('citizen.v2.how.title', 'Report a fire. Staff check it. Responders act.')}</h2>
      <ol className="space-y-5">{steps.map(({ icon: Icon, title, text }) => (
        <li key={title} className="flex gap-4">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-action-tint text-action"><Icon aria-hidden="true" size={24} strokeWidth={1.75} /></span>
          <span><span className="block text-lg font-bold">{title}</span><span className="block text-ink-muted">{text}</span></span>
        </li>))}</ol>
    </div>
  );
}
