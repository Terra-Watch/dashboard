import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Flame, MapPin, MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { useSession } from '../../app/session';
import { Notice } from '../../ui/Notice';
import { EmergencyStrip } from '../../ui/EmergencyStrip';
import { RungBadge } from '../../ui/RungBadge';
import { rungOfStatus } from '../../ui/ladder';
import { NoticeList, type NoticeItem } from './community/NoticesTab';
import { formatWhen, stateName } from './format';

type Row = { id: number; status: string; close_reason: string | null; state: string; created_at: string; updated_at: string };
type Post = { id: number; content: string | null; status: string; topic: string; created_at: string; author?: { name?: string } };

const region = () => { try { return localStorage.getItem('tw_region') ?? ''; } catch { return ''; } };
const snippet = (text: string | null) => { const value = (text ?? '').trim().replace(/\s+/g, ' '); return value.length > 140 ? `${value.slice(0, 137)}...` : value; };

/** The first screen after sign-in. One job: let a person report a fire in a few taps. Everything else is a short read below it. */
export function CitizenHome() {
  const { t } = useTranslation();
  const { user } = useSession();
  const reports = useQuery({ queryKey: ['my-reports'], queryFn: () => api<{ items: Row[] }>('/api/citizen/reports') });
  const notices = useQuery({ queryKey: ['notices', region()], queryFn: () => api<{ items: NoticeItem[] }>(`/api/notices${region() ? `?region=${region()}` : ''}`) });
  const posts = useQuery({ queryKey: ['community-posts', ''], queryFn: () => api<{ items: Post[] }>('/api/community/posts'), refetchInterval: 60_000 });
  const latest = reports.data?.items[0];
  const firstName = (user?.name ?? '').split(' ')[0];

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-[clamp(1.5rem,5vw,2rem)] leading-tight">{firstName ? t('citizen.home.hello', { name: firstName, defaultValue: 'Hello, {{name}}' }) : t('citizen.home.hello_plain', 'Hello')}</h1>

      <Link to="/citizen/report" className="group flex items-center gap-4 rounded-2xl border border-danger bg-danger p-5 text-on-action shadow-md transition-transform active:scale-[0.99]">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-on-action/15"><Flame aria-hidden="true" size={34} strokeWidth={1.75} /></span>
        <span className="min-w-0">
          <span className="block text-2xl font-bold leading-tight">{t('citizen.home.report_cta', 'See a fire? Report it')}</span>
          <span className="mt-1 block text-base opacity-90">{t('citizen.home.report_sub', 'Take a photo, tap what you see. It takes about a minute.')}</span>
        </span>
        <ChevronRight aria-hidden="true" className="ml-auto shrink-0 opacity-80" size={28} />
      </Link>
      <EmergencyStrip />

      {latest && (
        <section aria-labelledby="home-latest" className="space-y-2">
          <h2 id="home-latest" className="text-lg">{t('citizen.home.latest', 'Your latest report')}</h2>
          <Link to={`/citizen/reports/${latest.id}`} className="block rounded-xl border border-line bg-surface p-4 text-ink hover:bg-surface-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold">{t('citizen.reports.number', { id: latest.id, defaultValue: 'Report {{id}}' })}</span>
              <RungBadge rung={rungOfStatus(latest.status)} />
            </div>
            <p className="mt-1 text-sm text-ink-muted">{stateName(latest.state)} · {formatWhen(latest.updated_at)}</p>
          </Link>
          {(reports.data?.items.length ?? 0) > 1 && <Link to="/citizen/reports" className="inline-flex min-h-11 items-center font-semibold text-action underline">{t('citizen.home.all_reports', 'All my reports')}</Link>}
        </section>
      )}

      {Boolean(notices.data?.items.length) && (
        <section aria-labelledby="home-notices" className="space-y-2">
          <h2 id="home-notices" className="text-lg">{t('citizen.home.notices', 'Official notices for your area')}</h2>
          <NoticeList items={notices.data!.items.slice(0, 2)} />
        </section>
      )}

      <section aria-labelledby="home-community" className="space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 id="home-community" className="text-lg">{t('citizen.home.neighbours', 'From your neighbours')}</h2>
          <Link to="/citizen/community" className="inline-flex min-h-11 items-center font-semibold text-action underline">{t('citizen.home.open_community', 'Open community')}</Link>
        </div>
        {posts.isLoading ? <p className="text-ink-muted">{t('citizen.home.loading', 'Loading')}</p>
          : !posts.data?.items.length ? <Link to="/citizen/community" className="flex items-center gap-3 rounded-xl border border-dashed border-control bg-surface p-4 text-ink hover:bg-surface-2"><MessageCircle aria-hidden="true" className="shrink-0 text-ink-muted" /><span>{t('citizen.home.no_posts', 'No posts yet. Ask a question or share a local tip.')}</span></Link>
          : <ul className="space-y-2">{posts.data.items.slice(0, 3).map(post => (
              <li key={post.id}><Link to="/citizen/community" className="block rounded-xl border border-line bg-surface p-3 text-ink hover:bg-surface-2">
                <p className="line-clamp-3">{snippet(post.content)}</p>
                <p className="mt-1 text-sm text-ink-muted">{post.author?.name ? `${post.author.name} · ` : ''}{formatWhen(post.created_at)}</p>
              </Link></li>))}</ul>}
      </section>

      <Link to="/citizen/near-me" className="flex items-center gap-3 rounded-xl border border-line bg-surface p-4 text-ink hover:bg-surface-2">
        <MapPin aria-hidden="true" className="shrink-0 text-action" />
        <span className="min-w-0"><span className="block font-bold">{t('citizen.home.near', 'Fires and signals near me')}</span><span className="block text-sm text-ink-muted">{t('citizen.home.near_sub', 'See satellite detections and official notices around your place.')}</span></span>
        <ChevronRight aria-hidden="true" className="ml-auto shrink-0 text-ink-muted" />
      </Link>
    </div>
  );
}
