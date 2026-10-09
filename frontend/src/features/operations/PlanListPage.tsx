import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Plan = { id: number; plan_date: string; region: string; teams: number; priority_cells: number; status: string };

export function PlanListPage() { const [plans, setPlans] = useState<Plan[] | null>(null); const [error, setError] = useState(''); useEffect(() => { api<Plan[]>('/api/plans').then(setPlans).catch(reason => setError(reason instanceof Error ? reason.message : 'Plans could not be loaded.')); }, []);
  return <section className="shell-page"><span className="eyebrow">Patrol plans</span><h1>Plans for teams in the field.</h1><p className="muted">Review saved plans or create a new one from the forecast.</p><a className="primary-link" href="/app/plan/new">New patrol plan</a>{!plans && !error && <div className="empty large">Loading patrol plans…</div>}{error && <div className="empty large" role="alert">{error} Check the backend connection and try again.</div>}{plans && !plans.length && <div className="empty large">No patrol plans have been saved.</div>}{plans?.length ? <div className="record-list">{plans.map(plan => <article className="record-row" key={plan.id}><strong>{plan.plan_date}</strong><span>{plan.region} · {plan.teams} teams · top {plan.priority_cells} cells</span><span className="state-chip">{plan.status}</span></article>)}</div> : null}</section>; }
