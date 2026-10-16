import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { ApiError, api } from '../../../app/http';
import { Button } from '../../../ui/Button';
import { SelectField, TextField } from '../../../ui/Field';
import { Notice } from '../../../ui/Notice';
import { Skeleton } from '../../../ui/Page';
import { CHAT_MAX, looksLikeEmergency, nextPollDelay } from '../../community/communityLogic';
import { STATES, formatWhen } from '../format';

type Message = { id: number; content: string; status: string; created_at: string; badge?: string | null; author: { id?: number; name?: string } };
type Room = { region: string; slow_mode_seconds: number; frozen: boolean };

export function ChatTab() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [room, setRoom] = useState(() => { try { return localStorage.getItem('tw_region') || 'default'; } catch { return 'default'; } });
  const [text, setText] = useState('');
  const [problem, setProblem] = useState('');
  const [info, setInfo] = useState('');
  const [busy, setBusy] = useState(false);
  const [failures, setFailures] = useState(0);
  const [hidden, setHidden] = useState(document.hidden);
  const [newCount, setNewCount] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const lastSeen = useRef<number>(0);

  useEffect(() => { const onVisible = () => setHidden(document.hidden); document.addEventListener('visibilitychange', onVisible); return () => document.removeEventListener('visibilitychange', onVisible); }, []);
  const delay = nextPollDelay(failures, hidden);
  const chat = useQuery({
    queryKey: ['community-chat', room], refetchInterval: delay ?? false, retry: false,
    queryFn: async () => { try { const result = await api<{ items: Message[]; room: Room | null }>(`/api/community/chat?room=${encodeURIComponent(room)}`); setFailures(0); return result; } catch (error) { setFailures(count => count + 1); throw error; } },
  });
  const items = chat.data?.items ?? [];
  const settings = chat.data?.room;

  useEffect(() => {
    const newest = items[items.length - 1]?.id ?? 0;
    const el = listRef.current;
    const nearBottom = !el || el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (lastSeen.current && newest > lastSeen.current && !nearBottom) setNewCount(count => count + items.filter(item => item.id > lastSeen.current).length);
    else if (el) el.scrollTop = el.scrollHeight;
    lastSeen.current = newest;
  }, [items]);

  async function send(event: FormEvent) {
    event.preventDefault(); if (!text.trim() || busy) return;
    setBusy(true); setProblem(''); setInfo('');
    try {
      const result = await api<{ notice?: string }>(`/api/community/chat?room=${encodeURIComponent(room)}`, { method: 'POST', json: { content: text.trim() } });
      setText(''); if (result.notice) setInfo(result.notice);
      await queryClient.invalidateQueries({ queryKey: ['community-chat', room] });
    } catch (reason) { setProblem(reason instanceof ApiError ? reason.detail : t('citizen.chat.failed', 'Your message was not sent.')); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-3">
      <SelectField label={t('citizen.chat.room', 'Room')} value={room} onChange={event => { setRoom(event.target.value); lastSeen.current = 0; setNewCount(0); }}>
        <option value="default">{t('citizen.chat.everyone', 'Everyone')}</option>{STATES.map(state => <option key={state.code} value={state.code}>{state.name}</option>)}
      </SelectField>
      {settings?.frozen && <Notice kind="warning">{t('citizen.chat.frozen', 'This room is paused by moderators. You can read it but not post.')}</Notice>}
      {settings && settings.slow_mode_seconds > 0 && !settings.frozen && <Notice kind="info">{t('citizen.chat.slow', { seconds: settings.slow_mode_seconds, defaultValue: 'Slow mode: one message every {{seconds}} seconds.' })}</Notice>}
      {failures > 0 && <Notice kind="warning">{t('citizen.chat.stale', 'Chat could not refresh. Showing the last messages; trying again.')}</Notice>}
      <div className="relative">
        <div ref={listRef} role="log" aria-live="polite" aria-label={t('nav.community')} className="max-h-96 min-h-48 space-y-2 overflow-y-auto rounded-panel border border-line bg-surface p-3" onScroll={event => { const el = event.currentTarget; if (el.scrollHeight - el.scrollTop - el.clientHeight < 40) setNewCount(0); }}>
          {chat.isLoading ? <Skeleton lines={4} /> : !items.length ? <p className="text-ink-muted">{t('citizen.chat.empty', 'No messages yet. Say hello.')}</p>
            : items.map(item => <p key={item.id} className="border-t border-line pt-2 first:border-0 first:pt-0"><strong>{item.author?.name || t('citizen.community.member', 'Member')}</strong>{item.badge ? <span className="ml-1 rounded-full bg-action px-2 py-0.5 text-xs font-bold text-on-action">{item.badge}</span> : null} <span className="text-sm text-ink-muted">{formatWhen(item.created_at)}</span><br />{item.content}</p>)}
        </div>
        {newCount > 0 && <button type="button" className="absolute bottom-2 left-1/2 min-h-11 -translate-x-1/2 rounded-full bg-action px-4 font-semibold text-on-action shadow-md" onClick={() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight; setNewCount(0); }}>{t('citizen.chat.new', { count: newCount, defaultValue: '{{count}} new' })}</button>}
      </div>
      <form onSubmit={event => void send(event)} noValidate className="space-y-2">
        {problem && <Notice kind="danger">{problem}</Notice>}
        {info && <Notice kind="info">{info}</Notice>}
        {looksLikeEmergency(text) && <Notice kind="warning" title={t('citizen.community.emergency_title', 'Is this an emergency?')}>{t('citizen.community.emergency', 'Nobody is told when you post here.')} <Link className="font-bold underline" to="/citizen/report">{t('nav.report')}</Link></Notice>}
        <div className="flex items-end gap-2"><div className="flex-1"><TextField label={t('citizen.chat.message', 'Message')} maxLength={CHAT_MAX} value={text} onChange={event => setText(event.target.value)} disabled={Boolean(settings?.frozen)} /></div><Button type="submit" loading={busy} disabled={!text.trim() || Boolean(settings?.frozen)}>{t('citizen.chat.send', 'Send')}</Button></div>
        <p className="text-sm text-ink-muted">{t('citizen.chat.note', 'Updates about every 15 seconds. This is not an emergency channel.')} {text.length}/{CHAT_MAX}</p>
      </form>
    </div>
  );
}
