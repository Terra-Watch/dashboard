import * as Tabs from '@radix-ui/react-tabs';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Notice } from '../../ui/Notice';
import { PageTitle } from '../../ui/Page';
import { ChatTab } from './community/ChatTab';
import { DiscussionTab } from './community/DiscussionTab';
import { NoticesTab } from './community/NoticesTab';

export function CommunityPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('notices');
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle title={t('nav.community')} subtitle={t('citizen.community.subtitle', 'Ask, share and help each other. Official notices come first.')} />
      <Notice kind="info">{t('citizen.community.rule', 'Posts here never notify responders. Seeing a fire? Use Report.')}</Notice>
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List aria-label={t('nav.community')} className="flex gap-1 border-b border-line">
          {[['notices', t('citizen.community.notices', 'Official notices')], ['discussion', t('citizen.community.discussion', 'Discussion')], ['chat', t('citizen.community.chat', 'Chat')]].map(([value, label]) => (
            <Tabs.Trigger key={value} value={value} className="min-h-12 border-b-4 border-transparent px-4 text-base font-semibold data-[state=active]:border-action hover:bg-surface-2">{label}</Tabs.Trigger>))}
        </Tabs.List>
        <Tabs.Content value="notices" className="pt-4 outline-none"><NoticesTab /></Tabs.Content>
        <Tabs.Content value="discussion" className="pt-4 outline-none"><DiscussionTab /></Tabs.Content>
        <Tabs.Content value="chat" className="pt-4 outline-none"><ChatTab /></Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
