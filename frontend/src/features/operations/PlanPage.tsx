import { useState } from 'react';
import { api } from '../../lib/api';

type Route = { stops: Array<{ cell_id: number; state: string; band: string }>; travel_times_available: boolean };

export function PlanPage() {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [routing, setRouting] = useState(false);
  const [planId, setPlanId] = useState<number | null>(null);
  const [route, setRoute] = useState<Route | null>(null);
  const [error, setError] = useState('');
  const [date, setDate] = useState('2024-06-18');
  const [region, setRegion] = useState('All six states');
  const [teams, setTeams] = useState(1);
  const [cells, setCells] = useState(50);

  async function save() {
    setError(''); setSaved(false); setSaving(true);
    try {
      const result = await api<{ id: number }>('/api/plans', { method: 'POST', body: JSON.stringify({ date, region, teams, priority_cells: cells }) });
      setPlanId(result.id); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The plan could not be saved.'); }
    finally { setSaving(false); }
  }

  async function generateRoute() {
    if (!planId) return;
    setError(''); setRouting(true);
    try { setRoute(await api<Route>(`/api/plans/${planId}/route`, { method: 'POST' })); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'A route could not be generated.'); }
    finally { setRouting(false); }
  }

  return <section className="shell-page">
    <span className="eyebrow">Patrol plans</span>
    <h1>Move teams to priority cells.</h1>
    <p className="muted">Save the brief, then generate a priority stop sequence when a real forecast exists. Travel times require a connected routing service.</p>
    <div className="form-grid">
      <label>Date<input type="date" min="2023-01-01" max="2024-12-31" value={date} onChange={event => setDate(event.target.value)} /></label>
      <label>Region<select value={region} onChange={event => setRegion(event.target.value)}><option>All six states</option><option>Odisha</option><option>Chhattisgarh</option></select></label>
      <label>Teams<input type="number" min="1" value={teams} onChange={event => setTeams(Number(event.target.value))} /></label>
      <label>Priority cells<input type="number" min="20" max="200" value={cells} onChange={event => setCells(Number(event.target.value))} /></label>
    </div>
    <div className="action-row">
      <button disabled={!planId || routing || saving} onClick={() => void generateRoute()}>{routing ? 'Generating…' : 'Generate stop sequence'}</button>
      <button disabled={saving || routing} onClick={() => void save()}>{saving ? 'Saving…' : 'Save draft'}</button>
    </div>
    {!route && <div className="empty large">No stop sequence generated yet. A real forecast is required.</div>}
    {route && <div className="record-list">{route.stops.map((stop, index) => <article className="record-row" key={stop.cell_id}><strong>Stop {index + 1} · Cell {stop.cell_id}</strong><span>{stop.state} · {stop.band}</span></article>)}<p className="muted">Travel times are unavailable; confirm access and sequence in the field.</p></div>}
    {error && <p className="error" role="alert">{error}</p>}
    {saved && <div className="success-state">Plan draft saved.</div>}
  </section>;
}
