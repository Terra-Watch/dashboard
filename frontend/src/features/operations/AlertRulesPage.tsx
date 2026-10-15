import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Rule = { id: number; name: string; kind: string; enabled: boolean; channel: string };

function describeRuleValue(value: string) {
  const labels: Record<string, string> = {
    detection: 'New detection',
    'band-change': 'Risk level change',
    assignment: 'Assignment',
    'in-app': 'In-app notification',
  };
  return labels[value] ?? value.replace(/-/g, ' ');
}

export function AlertRulesPage() {
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [name, setName] = useState('New detection');
  const [kind, setKind] = useState('detection');
  const [channel, setChannel] = useState('in-app');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { api<Rule[]>('/api/alerts/rules').then(setRules).catch(reason => setError(reason instanceof Error ? reason.message : 'Rules could not be loaded.')); }, []);
  async function addRule(event: React.FormEvent) {
    event.preventDefault(); setError(''); setSaving(true);
    try { const created = await api<Rule>('/api/alerts/rules', { method: 'POST', body: JSON.stringify({ name, kind, channel, enabled: true }) }); setRules(items => [...(items || []), created]); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Rule could not be saved.'); }
    finally { setSaving(false); }
  }
  return <section className="shell-page"><span className="eyebrow">Alert rules</span><h1>Saved alert settings</h1><p className="muted">These settings can be saved, but alerts are not yet generated from them. Email and push delivery are not available.</p>
    <form className="form-grid" onSubmit={addRule}><label>Name<input value={name} onChange={event => setName(event.target.value)} required /></label><label>Trigger<select value={kind} onChange={event => setKind(event.target.value)}><option value="detection">New detection</option><option value="band-change">Risk band change</option><option value="assignment">Assignment</option></select></label><label>Channel<select value={channel} onChange={event => setChannel(event.target.value)}><option value="in-app">In-app</option><option disabled value="email">Email unavailable</option><option disabled value="push">Push unavailable</option></select></label><button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save rule'}</button></form>
    {error && <div className="empty" role="alert">{error}</div>}{!rules && !error && <div className="empty large">Loading alert rules…</div>}{rules && !rules.length && <div className="empty large">No alert rules have been configured.</div>}{rules?.length ? <div className="record-list">{rules.map(rule => <article className="record-row" key={rule.id}><strong>{rule.name}</strong><span>{describeRuleValue(rule.kind)} · {describeRuleValue(rule.channel)}</span><span className="state-chip">{rule.enabled ? 'enabled' : 'paused'}</span></article>)}</div> : null}</section>;
}
