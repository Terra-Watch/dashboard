import { Brand } from '../../components/Brand';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { OfflineDemoPage } from './OfflineDemoPage';
import { PwaInstallPrompt } from '../../components/PwaInstallPrompt';
import { API } from '../../app/config';
import { getCsrfToken } from '../lib/sessionAuth';
import { safeCitizenReturnTo } from '../lib/citizenAuth';

type Navigate = (path: string) => void;

function PublicLayout({ go, current, children }: { go: Navigate; current: string; children: ReactNode }) {
  const links = [
    ['/community', 'Community'],
    ['/citizen', 'Citizen'],
    ['/community/archive', 'Archive'],
  ] as const;
  return (
    <div className="min-h-screen bg-paper text-ink" data-rq-app data-public-portal>
      <header className="sticky top-0 z-10 border-b border-contour bg-sheet/95 px-5 py-3 backdrop-blur sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4">
          <a href="/" onClick={event => { event.preventDefault(); go('/'); }} aria-label="TerraWatch home"><Brand dark /></a>
          <nav aria-label="Public navigation" className="flex items-center gap-4 text-sm font-semibold sm:gap-6">
            {links.map(([href, label]) => <a key={href} href={href} onClick={event => { event.preventDefault(); go(href); }} className={current === href ? 'border-b-2 border-canopy pb-1 text-canopy' : 'text-ink-muted hover:text-ink'}>{label}</a>)}
            <a href="/staff/login" onClick={event => { event.preventDefault(); go('/staff/login'); }} className="rounded-rq border border-canopy px-3 py-2 text-canopy hover:bg-paper">Staff sign in</a>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <PwaInstallPrompt />
      <footer className="border-t border-contour bg-sheet px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-wrap items-start justify-between gap-5 text-sm text-ink-muted">
          <div><Brand dark /><p className="mt-2 max-w-sm text-xs">Public information and secure reporting pathways for communities and response teams.</p></div>
          <p className="max-w-sm text-xs">Public pages do not expose private evidence, reviewer notes, or staff records. Historical examples are clearly labelled and are not current fire activity.</p>
        </div>
      </footer>
    </div>
  );
}

function EntryCard({ title, eyebrow, copy, action, onClick }: { title: string; eyebrow: string; copy: string; action: string; onClick: () => void }) {
  return <article className="flex min-h-52 flex-col justify-between rounded-rq border border-contour bg-sheet p-5 shadow-sm">
    <div><p className="text-xs font-bold uppercase tracking-wider text-canopy">{eyebrow}</p><h2 className="mt-2 font-serif text-2xl">{title}</h2><p className="mt-2 text-sm leading-6 text-ink-muted">{copy}</p></div>
    <button type="button" onClick={onClick} className="mt-5 w-full rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white hover:bg-canopy-deep">{action}</button>
  </article>;
}

export function PublicLandingPage({ go }: { go: Navigate }) {
  return <PublicLayout go={go} current="/">
    <section className="mx-auto max-w-6xl px-5 pb-10 pt-12 sm:px-8 sm:pb-14 sm:pt-16">
      <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-canopy">Wildfire information, made clearer</p><h1 className="mt-3 font-serif text-4xl leading-tight sm:text-6xl">Know what is public, what is reported, and what needs response.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-ink-muted sm:text-lg">TerraWatch connects public fire information with secure reporting and permissioned operational tools. Choose the experience that fits you.</p></div>
      <div className="mt-9 grid gap-4 md:grid-cols-3" aria-label="TerraWatch entry points">
        <EntryCard title="CITIZEN / COMMUNITY" eyebrow="Protected Citizen application" copy="Report fires and access public fire information, community discussions, reporting, and safety guidance." action="Continue as Citizen" onClick={() => go('/citizen/login')} />
        <EntryCard title="RANGER / FIELD OFFICER" eyebrow="Authorized field operations" copy="Access authorized field operations, incidents, and field-reporting workflows." action="Ranger Login" onClick={() => go('/staff/login')} />
        <EntryCard title="CONTROL ROOM" eyebrow="Authorized incident operations" copy="Access authorized incident monitoring, triage, and evidence-review workflows." action="Control Room Login" onClick={() => go('/staff/login?workspace=control-room')} />
      </div>
    </section>
    <section className="border-y border-contour bg-sheet px-5 py-8 sm:px-8" aria-labelledby="public-private-heading"><div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-[1.3fr_1fr]"><div><p className="text-xs font-bold uppercase tracking-wider text-canopy">A clear boundary</p><h2 id="public-private-heading" className="mt-2 font-serif text-2xl">Public information and restricted operations are separate by design.</h2></div><p className="text-sm leading-6 text-ink-muted">Community pages show information intended for everyone. Citizen submissions are protected and incident-scoped. Staff tools require server-verified credentials and permissions; choosing a role in the browser can never grant access.</p></div></section>
    <section className="mx-auto grid max-w-6xl gap-4 px-5 py-10 sm:px-8 md:grid-cols-2"><article className="rounded-rq border border-contour p-5"><p className="text-xs font-bold uppercase tracking-wider text-canopy">Public archive</p><h2 className="mt-2 font-serif text-2xl">Historical demonstrations, clearly marked.</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Review saved rankings and spread examples from past dates. They are not live monitoring, official warnings, or confirmed current incidents.</p><button type="button" onClick={() => go('/community/archive')} className="mt-5 rounded-rq border border-contour px-4 py-2 text-sm font-semibold hover:border-canopy">Open the archive</button></article><article className="rounded-rq border border-contour bg-canopy p-5 text-white"><p className="text-xs font-bold uppercase tracking-wider text-white/80">Need to report something?</p><h2 className="mt-2 font-serif text-2xl">Start with the Citizen reporting pathway.</h2><p className="mt-2 text-sm leading-6 text-white/80">Your report is only submitted after the secure reporting workflow authenticates you. This public page never creates a report by itself.</p><button type="button" onClick={() => go('/citizen')} className="mt-5 rounded-rq bg-white px-4 py-2 text-sm font-semibold text-canopy hover:bg-paper">Report a fire</button></article></section>
  </PublicLayout>;
}

export function PublicArchivePage({ go }: { go: Navigate }) {
  return <PublicLayout go={go} current="/community/archive"><ArchivedCommunityPosts /><OfflineDemoPage /></PublicLayout>;
}

function ArchivedCommunityPosts() {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  useEffect(() => { void fetch(`${API}/api/community/posts?archived=true`).then(response => response.ok ? response.json() : Promise.reject()).then(data => setPosts(data.items)).catch(() => setPosts([])); }, []);
  if (!posts.length) return null;
  return <section className="mx-auto max-w-6xl px-5 pt-8 sm:px-8" aria-labelledby="archived-community-heading"><div className="rounded-rq border border-contour bg-sheet p-5"><p className="text-xs font-bold uppercase tracking-wider text-canopy">Archived community posts</p><h2 id="archived-community-heading" className="mt-1 font-serif text-2xl">Past discussion, clearly separated</h2><div className="mt-4 grid gap-3 md:grid-cols-2">{posts.map(post => <article key={post.id} className="rounded-rq border border-contour p-4"><p className="whitespace-pre-wrap text-sm leading-6">{post.content}</p><p className="mt-3 text-xs text-ink-muted">{post.author?.name || 'TerraWatch member'} · Historical community item</p></article>)}</div></div></section>;
}

export function CommunityPage({ go }: { go: Navigate }) {
  return <PublicLayout go={go} current="/community"><CommunityDiscussion go={go} /></PublicLayout>;
}

type CommunityPost = { id: number; content: string; created_at: string; archived: boolean; comments_count: number; author: { name?: string } };
type ChatMessage = { id: number; content: string; created_at: string; author: { name?: string } };

function CommunityDiscussion({ go }: { go: Navigate }) {
  const [posts, setPosts] = useState<CommunityPost[]>([]);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [postText, setPostText] = useState('');
  const [chatText, setChatText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const authenticated = Boolean(localStorage.getItem('resq_token'));
  const request = async (path: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers);
    if (options.body) headers.set('Content-Type', 'application/json');
    const token = localStorage.getItem('resq_token');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const csrf = getCsrfToken();
    if (csrf && options.method && options.method !== 'GET') headers.set('x-resq-csrf', csrf);
    const response = await fetch(`${API}${path}`, { ...options, headers, credentials: 'include' });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || 'Community information is unavailable.');
    return data;
  };
  const load = async (quiet = false) => {
    try {
      const [postData, chatData] = await Promise.all([request('/api/community/posts'), authenticated ? request('/api/community/chat') : Promise.resolve({ items: [] })]);
      setPosts(postData.items); setChat(chatData.items); setError('');
    } catch (reason) { if (!quiet) setError(reason instanceof Error ? reason.message : 'Community information is unavailable.'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); const timer = authenticated ? window.setInterval(() => void load(true), 5000) : undefined; return () => { if (timer) window.clearInterval(timer); }; }, [authenticated]);
  async function submitPost(event: FormEvent) { event.preventDefault(); try { await request('/api/community/posts', { method: 'POST', body: JSON.stringify({ content: postText }) }); setPostText(''); await load(true); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Post was not published.'); } }
  async function submitChat(event: FormEvent) { event.preventDefault(); try { await request('/api/community/chat', { method: 'POST', body: JSON.stringify({ content: chatText }) }); setChatText(''); await load(true); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Message was not sent.'); } }
  const login = () => go(`/citizen/login?returnTo=${encodeURIComponent(safeCitizenReturnTo('/community'))}`);
  return <section className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-14"><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-wider text-canopy">Community</p><h1 className="mt-3 font-serif text-4xl sm:text-5xl">Public information, local context, and respectful discussion.</h1><p className="mt-5 text-base leading-7 text-ink-muted">Posts and chat are community discussion only. They never create a fire report, notify responders, or expose private evidence. Use <button className="underline" onClick={() => go('/citizen')}>Citizen reporting</button> for a suspected fire.</p></div>{error && <p role="alert" className="mt-5 rounded-rq border border-warn/50 bg-paper p-3 text-sm">{error}</p>}<div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]"><section className="rounded-rq border border-contour bg-sheet p-5" aria-labelledby="community-feed-heading"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wider text-canopy">Community feed</p><h2 id="community-feed-heading" className="mt-1 font-serif text-2xl">Shared updates</h2></div>{!authenticated && <button onClick={login} className="rounded-rq border border-canopy px-3 py-2 text-sm font-semibold text-canopy">Sign in to post</button>}</div>{authenticated && <form onSubmit={event => void submitPost(event)} className="mt-5"><label htmlFor="community-post" className="sr-only">Write a community post</label><textarea id="community-post" value={postText} onChange={event => setPostText(event.target.value)} maxLength={2000} required placeholder="Share preparedness information or local context…" className="min-h-24 w-full rounded-rq border border-contour bg-paper p-3 text-sm"/><div className="mt-2 flex justify-end"><button className="rounded-rq bg-canopy px-4 py-2 text-sm font-semibold text-white" type="submit">Publish community post</button></div></form>}{loading ? <p role="status" className="mt-6 text-sm text-ink-muted">Loading community posts…</p> : posts.length ? <div className="mt-6 grid gap-3">{posts.map(post => <article key={post.id} className="rounded-rq border border-contour p-4"><p className="whitespace-pre-wrap text-sm leading-6">{post.content}</p><p className="mt-3 text-xs text-ink-muted">{post.author?.name || 'TerraWatch member'} · {new Date(post.created_at).toLocaleString()}</p></article>)}</div> : <p className="mt-6 rounded-rq border border-dashed border-contour p-5 text-sm text-ink-muted">No community posts yet. This feed is empty until an authenticated member publishes one.</p>}</section><section className="rounded-rq border border-contour bg-canopy p-5 text-white" aria-labelledby="community-chat-heading"><p className="text-xs font-bold uppercase tracking-wider text-white/75">Member chat · polling every 5 seconds</p><h2 id="community-chat-heading" className="mt-1 font-serif text-2xl">Talk with the community</h2><p className="mt-2 text-sm leading-6 text-white/80">Chat is persisted and bounded to recent history. It is not an emergency channel.</p>{authenticated ? <form onSubmit={event => void submitChat(event)} className="mt-5"><label htmlFor="community-chat" className="sr-only">Chat message</label><input id="community-chat" value={chatText} onChange={event => setChatText(event.target.value)} maxLength={1000} required placeholder="Write a message…" className="w-full rounded-rq border-0 bg-white/95 px-3 py-3 text-sm text-ink"/><button className="mt-2 rounded-rq bg-white px-4 py-2 text-sm font-semibold text-canopy" type="submit">Send message</button></form> : <button onClick={login} className="mt-5 rounded-rq bg-white px-4 py-2 text-sm font-semibold text-canopy">Sign in to join chat</button>}<div className="mt-5 max-h-64 space-y-3 overflow-y-auto" aria-live="polite">{authenticated && chat.length ? chat.map(item => <p key={item.id} className="border-t border-white/20 pt-2 text-sm"><strong>{item.author?.name || 'Member'}</strong><br/>{item.content}</p>) : <p className="text-sm text-white/75">Sign in to view member chat history.</p>}</div></section></div><p className="mt-6 text-xs text-ink-muted">Moderation: use the report control on a post when available; abusive or unsafe content may be removed. For immediate danger, contact local emergency services.</p></section>;
}

export function CitizenPage({ go }: { go: Navigate }) {
  return <PublicLayout go={go} current="/citizen"><section className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16"><p className="text-xs font-bold uppercase tracking-wider text-canopy">Citizen reporting</p><h1 className="mt-3 font-serif text-4xl sm:text-5xl">Report a suspected fire with the information you have.</h1><p className="mt-5 max-w-2xl text-base leading-7 text-ink-muted">The secure reporting workflow accepts a report and supporting photographs when an authenticated account is available. Submissions remain separate from automated assessment and require human review.</p><div className="mt-8 grid gap-4 md:grid-cols-3"><div className="rounded-rq border border-contour bg-sheet p-5"><span className="text-2xl text-canopy">01</span><h2 className="mt-3 font-serif text-xl">Describe</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Share where and when you observed the suspected fire.</p></div><div className="rounded-rq border border-contour bg-sheet p-5"><span className="text-2xl text-canopy">02</span><h2 className="mt-3 font-serif text-xl">Attach</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Upload photographs through the private evidence workflow.</p></div><div className="rounded-rq border border-contour bg-sheet p-5"><span className="text-2xl text-canopy">03</span><h2 className="mt-3 font-serif text-xl">Track</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Follow the submitted report and any human-review status from your authenticated workspace.</p></div></div><div className="mt-8 rounded-rq border border-warn/40 bg-paper p-5"><h2 className="font-serif text-xl">Secure submission required</h2><p className="mt-2 text-sm leading-6 text-ink-muted">This public page does not create a fake report or expose private records. Continue to the secure sign-in flow to access the existing authenticated reporting form.</p><button type="button" onClick={() => go('/staff/login')} className="mt-4 rounded-rq border border-canopy bg-canopy px-4 py-2.5 text-sm font-semibold text-white">Continue to secure reporting</button></div></section></PublicLayout>;
}
