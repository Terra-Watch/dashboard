import * as Tabs from '@radix-ui/react-tabs';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../app/http';
import { Notice } from '../../ui/Notice';
import { PageTitle } from '../../ui/Page';
import { ChatTab } from './community/ChatTab';
import { DiscussionTab } from './community/DiscussionTab';
import { NoticesTab } from './community/NoticesTab';

export function CommunityPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState('discussion');
  const mine = useQuery({ queryKey: ['my-community'], queryFn: () => api<{ community: { slug: string; name: string; forest_name: string; area: string } | null }>('/api/community/mine'), staleTime: 60_000 });
  const community = mine.data?.community ?? null;
  const spaces = community ? [['discussion', t('citizen.community.discussion', 'Discussion')], ['chat', t('citizen.community.chat', 'Chat')], ['notices', t('citizen.community.notices', 'Official notices')]] : [['notices', t('citizen.community.notices', 'Official notices')]];
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <PageTitle title={t('nav.community')} subtitle={t('citizen.v2.community_sub', 'Ask a question, share a local tip, help a neighbour. Official notices are on Home and Near me.')} />
      {community && <p className="rounded-panel border border-line bg-surface p-3"><span className="font-bold">{community.name}</span><span className="block text-sm text-ink-muted">{community.forest_name} · {community.area}</span></p>}
      {mine.isSuccess && !community && <Notice kind="info">{t('citizen.community.none', 'You are not part of a forest community yet. You join the one around a forest when you send a report from near it.')}</Notice>}
      <Notice kind="info">{t('citizen.community.rule', 'Posts here never notify responders. Seeing a fire? Use Report.')}</Notice>
      <Tabs.Root value={community ? tab : 'notices'} onValueChange={setTab}>
        <Tabs.List aria-label={t('nav.community')} className="flex gap-1 border-b border-line">
          {spaces.map(([value, label]) => (
            <Tabs.Trigger key={value} value={value} className="min-h-12 border-b-4 border-transparent px-4 text-base font-semibold data-[state=active]:border-action hover:bg-surface-2">{label}</Tabs.Trigger>))}
        </Tabs.List>
        <Tabs.Content value="notices" className="pt-4 outline-none"><NoticesTab /></Tabs.Content>
        {community && <Tabs.Content value="discussion" className="pt-4 outline-none"><DiscussionTab /></Tabs.Content>}
        {community && <Tabs.Content value="chat" className="pt-4 outline-none"><ChatTab room={community.slug} /></Tabs.Content>}
      </Tabs.Root>
    </div>
  );
}
