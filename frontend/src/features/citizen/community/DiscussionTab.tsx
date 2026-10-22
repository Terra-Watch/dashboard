import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquarePlus, ThumbsUp } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, api } from '../../../app/http';
import { useSession } from '../../../app/session';
import { Button } from '../../../ui/Button';
import { SelectField, TextArea, TextField } from '../../../ui/Field';
import { Notice } from '../../../ui/Notice';
import { Card, EmptyState, Skeleton } from '../../../ui/Page';
import { LANGUAGES_FOR_POSTS, MAX_POST, REPORT_REASONS, TOPICS, canEdit, looksLikeEmergency, removalText, validatePost } from '../../community/communityLogic';
import { formatWhen } from '../format';

type Removed = { by?: string | null; reason?: string | null };
type Post = { id: number; content: string | null; status: string; state?: string; created_at: string; edited_at?: string | null; topic: string; language: string; region?: string | null; verified: boolean; helpful_count: number; helpful_by_me: boolean; comments_count: number; badge?: string | null; author: { id?: number; name?: string }; removed?: Removed };
type Comment = { id: number; content: string | null; status: string; created_at: string; edited_at?: string | null; badge?: string | null; author: { id?: number; name?: string }; removed?: Removed };

const POSTS_KEY = ['community-posts'] as const;

export function DiscussionTab() {
  const { t } = useTranslation();
  const { user } = useSession();
  const [topic, setTopic] = useState('');
  const posts = useQuery({ queryKey: [...POSTS_KEY, topic], queryFn: () => api<{ items: Post[] }>(`/api/community/posts${topic ? `?topic=${topic}` : ''}`), refetchInterval: 30_000 });
  const [notice, setNotice] = useState<{ kind: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [writing, setWriting] = useState(false);

  return (
    <div className="space-y-4">
      {writing
        ? <Composer onDone={message => { setNotice(message); if (message.kind !== 'danger') setWriting(false); void posts.refetch(); }} />
        : <button type="button" onClick={() => setWriting(true)} className="flex min-h-16 w-full items-center gap-3 rounded-xl border-2 border-action bg-action-tint px-4 text-left text-lg font-semibold text-ink hover:bg-surface-2"><MessageSquarePlus aria-hidden="true" className="shrink-0 text-action" size={26} />{t('citizen.v2.ask', 'Ask a question or share a local tip')}</button>}
      {notice && <Notice kind={notice.kind}>{notice.text}</Notice>}
      <SelectField label={t('citizen.community.filter', 'Show')} value={topic} onChange={event => setTopic(event.target.value)}>
        <option value="">{t('citizen.community.all_topics', 'All posts')}</option>
        {TOPICS.map(item => <option key={item.value} value={item.value}>{t(`citizen.topic.${item.value}`, item.label)}</option>)}
      </SelectField>
      {posts.isLoading ? <Skeleton lines={4} /> : posts.isError ? <Notice kind="danger">{t('citizen.community.error', 'The discussion could not be loaded.')} <button className="underline" onClick={() => void posts.refetch()}>{t('citizen.retry', 'Try again')}</button></Notice>
        : !posts.data?.items.length ? <EmptyState title={t('citizen.community.empty', 'Be the first to ask a question.')}>{t('citizen.community.empty_hint', 'Questions and local tips from neighbours appear here.')}</EmptyState>
        : <ul className="space-y-3" aria-label={t('citizen.community.discussion', 'Discussion')}>{posts.data.items.map(post => <li key={post.id}><PostCard post={post} userId={user?.id} onChanged={() => void posts.refetch()} onNotice={setNotice} /></li>)}</ul>}
    </div>
  );
}

function Composer({ onDone }: { onDone: (notice: { kind: 'success' | 'danger' | 'info'; text: string }) => void }) {
  const { t } = useTranslation();
  const [body, setBody] = useState(''); const [topic, setTopic] = useState('question'); const [language, setLanguage] = useState('en'); const [region, setRegion] = useState('');
  const [busy, setBusy] = useState(false);
  const problem = validatePost(body);
  const emergency = looksLikeEmergency(body);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (problem || busy) return; setBusy(true);
    try {
      const result = await api<{ post: { status: string }; message?: string }>('/api/community/posts', { method: 'POST', json: { content: body.trim(), topic, post_type: topic, language, region: region.trim() || undefined } });
      setBody(''); setRegion('');
      onDone(result.post.status === 'held' ? { kind: 'info', text: result.message ?? t('citizen.community.held', 'A moderator will look at this before it appears.') } : { kind: 'success', text: t('citizen.community.published', 'Posted. Only signed-in members can see it.') });
    } catch (reason) { onDone({ kind: 'danger', text: reason instanceof ApiError ? reason.detail : t('citizen.community.post_failed', 'Your post was not published.') }); }
    finally { setBusy(false); }
  }
  return (
    <form onSubmit={event => void submit(event)} noValidate className="space-y-3 rounded-panel border border-line bg-surface p-4">
      <h2 className="text-xl">{t('citizen.community.write', 'Write a post')}</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        <SelectField label={t('citizen.community.type', 'Type')} value={topic} onChange={event => setTopic(event.target.value)}>{TOPICS.map(item => <option key={item.value} value={item.value}>{t(`citizen.topic.${item.value}`, item.label)}</option>)}</SelectField>
        <SelectField label={t('citizen.community.language', 'Post language')} value={language} onChange={event => setLanguage(event.target.value)}>{LANGUAGES_FOR_POSTS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectField>
        <TextField label={t('citizen.community.area', 'Area (district)')} maxLength={80} value={region} onChange={event => setRegion(event.target.value)} />
      </div>
      <TextArea label={t('citizen.community.post', 'Your post')} rows={4} value={body} onChange={event => setBody(event.target.value)} hint={t('citizen.community.no_contact', 'Do not share phone numbers, links or exact locations; such posts wait for a moderator.')} />
      {emergency && <Notice kind="warning" title={t('citizen.community.emergency_title', 'Is this an emergency?')}>{t('citizen.community.emergency', 'Nobody is told when you post here.')} <Link className="font-bold underline" to="/citizen/report">{t('nav.report')}</Link></Notice>}
      <div className="flex items-center justify-between gap-3"><span className={`text-sm ${body.length > MAX_POST ? 'font-bold text-danger' : 'text-ink-muted'}`} aria-live="polite">{body.length}/{MAX_POST}</span><Button type="submit" loading={busy} disabled={Boolean(problem)}>{t('citizen.community.publish', 'Post')}</Button></div>
    </form>
  );
}

function PostCard({ post, userId, onChanged, onNotice }: { post: Post; userId?: number; onChanged: () => void; onNotice: (n: { kind: 'success' | 'danger' | 'info'; text: string }) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(post.content ?? '');
  const [reporting, setReporting] = useState(false); const [reason, setReason] = useState<string>(REPORT_REASONS[0]);
  const [open, setOpen] = useState(false);
  const mine = post.author?.id === userId;
  const run = async (action: () => Promise<unknown>, success?: string) => { try { await action(); if (success) onNotice({ kind: 'success', text: success }); onChanged(); } catch (error) { onNotice({ kind: 'danger', text: error instanceof ApiError ? error.detail : t('citizen.community.failed', 'That did not work. Try again.') }); } };
  if (post.removed) return <p className="rounded-panel border border-dashed border-control bg-surface p-4 text-ink-muted">{removalText(post.removed)}</p>;
  return (
    <article className="rounded-panel border border-line bg-surface p-4">
      <p className="inline-flex flex-wrap items-center gap-x-1 rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-ink-muted">{t(`citizen.topic.${post.topic}`, post.topic)}{post.region ? ` · ${post.region}` : ''}{post.topic === 'information' ? ` · ${t('citizen.community.unverified', 'not verified')}` : ''}{post.status === 'held' ? ` · ${t('citizen.community.waiting', 'waiting for a moderator')}` : ''}</p>
      {editing ? (
        <form className="mt-2 space-y-2" onSubmit={event => { event.preventDefault(); void run(async () => { await api(`/api/community/posts/${post.id}`, { method: 'PATCH', json: { content: draft.trim() } }); setEditing(false); }, t('citizen.community.updated', 'Post updated.')); }}>
          <TextArea label={t('citizen.community.edit', 'Edit post')} rows={3} value={draft} onChange={event => setDraft(event.target.value)} />
          <div className="flex gap-2"><Button type="submit" disabled={Boolean(validatePost(draft))}>{t('citizen.community.save', 'Save')}</Button><Button variant="secondary" onClick={() => setEditing(false)}>{t('citizen.community.cancel', 'Cancel')}</Button></div>
        </form>
      ) : <p className="mt-2 whitespace-pre-wrap text-lg">{post.content}</p>}
      <p className="mt-2 text-sm text-ink-muted">{post.author?.name || t('citizen.community.member', 'Member')}{post.badge ? <span className="ml-1 rounded-full bg-action px-2 py-0.5 text-xs font-bold text-on-action">{post.badge}</span> : null} · {formatWhen(post.created_at)}{post.edited_at ? ` · ${t('citizen.community.edited', 'edited')}` : ''}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <button type="button" aria-pressed={post.helpful_by_me} onClick={() => void run(() => api(`/api/community/posts/${post.id}/helpful`, { method: 'POST', json: {} }))} className={`inline-flex min-h-11 items-center gap-1.5 rounded-rq border px-3 font-semibold ${post.helpful_by_me ? 'border-action bg-action-tint' : 'border-line hover:bg-surface-2'}`}><ThumbsUp aria-hidden="true" size={16} />{t('citizen.community.helpful', 'Helpful')} {post.helpful_count > 0 && post.helpful_count}</button>
        <button type="button" aria-expanded={open} onClick={() => setOpen(value => !value)} className="min-h-11 rounded-rq px-3 font-semibold underline">{t('citizen.community.comments', { count: post.comments_count, defaultValue: '{{count}} comments' })}</button>
        {mine && canEdit({ author: post.author, created_at: post.created_at }, userId, Date.now()) && !editing && <button type="button" className="min-h-11 px-3 underline" onClick={() => { setDraft(post.content ?? ''); setEditing(true); }}>{t('citizen.community.edit_button', 'Edit')}</button>}
        {mine ? <button type="button" className="min-h-11 px-3 text-danger underline" onClick={() => { if (window.confirm(t('citizen.community.confirm_delete', 'Delete this post?'))) void run(() => api(`/api/community/posts/${post.id}`, { method: 'DELETE' }), t('citizen.community.deleted', 'Post deleted.')); }}>{t('citizen.community.delete', 'Delete')}</button>
          : <button type="button" className="min-h-11 px-3 underline" onClick={() => setReporting(value => !value)}>{t('citizen.community.report', 'Report')}</button>}
      </div>
      {reporting && (
        <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); void run(async () => { await api(`/api/community/posts/${post.id}/report`, { method: 'POST', json: { reason } }); setReporting(false); }, t('citizen.community.reported', 'Thanks. A moderator will review it.')); }}>
          <SelectField label={t('citizen.community.reason', 'Reason')} value={reason} onChange={event => setReason(event.target.value)}>{REPORT_REASONS.map(item => <option key={item}>{item}</option>)}</SelectField>
          <Button type="submit" variant="secondary">{t('citizen.community.send_report', 'Send report')}</Button>
        </form>)}
      {open && <Comments postId={post.id} userId={userId} onNotice={onNotice} onCountChange={onChanged} />}
    </article>
  );
}

function Comments({ postId, userId, onNotice, onCountChange }: { postId: number; userId?: number; onNotice: (n: { kind: 'success' | 'danger' | 'info'; text: string }) => void; onCountChange: () => void }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const key = ['community-comments', postId];
  const comments = useQuery({ queryKey: key, queryFn: () => api<{ items: Comment[] }>(`/api/community/posts/${postId}/comments`) });
  const [text, setText] = useState('');
  async function add(event: FormEvent) {
    event.preventDefault(); if (!text.trim()) return;
    try { const result = await api<{ comment: { status: string }; message?: string }>(`/api/community/posts/${postId}/comments`, { method: 'POST', json: { content: text.trim() } }); setText(''); if (result.comment.status === 'held') onNotice({ kind: 'info', text: result.message ?? t('citizen.community.held', 'A moderator will look at this before it appears.') }); await queryClient.invalidateQueries({ queryKey: key }); onCountChange(); }
    catch (reason) { onNotice({ kind: 'danger', text: reason instanceof ApiError ? reason.detail : t('citizen.community.failed', 'That did not work. Try again.') }); }
  }
  return (
    <div className="mt-3 border-t border-line pt-3">
      {comments.isLoading ? <Skeleton lines={2} /> : !comments.data?.items.length ? <p className="text-ink-muted">{t('citizen.community.no_comments', 'No comments yet.')}</p>
        : <ul className="space-y-2">{comments.data.items.map(item => item.removed ? <li key={item.id} className="text-ink-muted">{removalText(item.removed)}</li> : (
          <li key={item.id}><strong>{item.author?.name || t('citizen.community.member', 'Member')}</strong>{item.badge ? <span className="ml-1 rounded-full bg-action px-2 py-0.5 text-xs font-bold text-on-action">{item.badge}</span> : null} <span className="text-sm text-ink-muted">{formatWhen(item.created_at)}</span><br />{item.content}
            {item.author?.id === userId && <button type="button" className="ml-2 min-h-11 text-sm text-danger underline" onClick={() => { if (window.confirm(t('citizen.community.confirm_delete_comment', 'Delete this comment?'))) void api(`/api/community/comments/${item.id}`, { method: 'DELETE' }).then(() => queryClient.invalidateQueries({ queryKey: key })); }}>{t('citizen.community.delete', 'Delete')}</button>}</li>))}</ul>}
      <form onSubmit={event => void add(event)} className="mt-3 flex items-end gap-2"><div className="flex-1"><TextField label={t('citizen.community.add_comment', 'Add a comment')} maxLength={1000} value={text} onChange={event => setText(event.target.value)} /></div><Button type="submit" disabled={!text.trim()}>{t('citizen.community.reply', 'Reply')}</Button></form>
    </div>
  );
}
export { Card };
