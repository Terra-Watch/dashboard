import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Notification = { id: number; kind: string; message: string; read: boolean; created_at: string };

export function NotificationsPage() { const [items, setItems] = useState<Notification[] | null>(null); const [error, setError] = useState(''); useEffect(() => { api<Notification[]>('/api/notifications').then(setItems).catch(reason => setError(reason instanceof Error ? reason.message : 'Notifications could not be loaded.')); }, []);
  return <section className="shell-page"><span className="eyebrow">Notifications</span><h1>Updates for your operations.</h1>{!items && !error && <div className="empty large">Loading notifications…</div>}{error && <div className="empty large" role="alert">{error} Check the backend connection and try again.</div>}{items && !items.length && <div className="empty large">You have no notifications.</div>}{items?.length ? <div className="record-list">{items.map(item => <article className="record-row" key={item.id}><strong>{item.kind}</strong><span>{item.message}</span><time dateTime={item.created_at}>{new Date(item.created_at).toLocaleString()}</time></article>)}</div> : null}</section>; }
