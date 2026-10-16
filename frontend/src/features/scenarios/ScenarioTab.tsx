import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ApiError, api } from '../../app/http';
import { Button } from '../../ui/Button';
import { SelectField, TextArea, TextField } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card } from '../../ui/Page';
import { Legend } from '../map/Legend';
import { MapView } from '../map/MapView';
import type { MapPoint, MapPolygon } from '../map/geojson';
import { assessExposure, realityCheck, type Asset, type Observation } from './engine/index.ts';
import { EMPTY_FORM, isOutdated, msToKmh, parsePlan, reachTable, runPlan, type PlanForm } from './plan.ts';

type Wind = { wind_speed_ms: number; wind_dir_deg: number; valid_time: string; freshness: { age_seconds: number; stale: boolean | null } };
type Signal = { id: number; latitude: number; longitude: number; acq_datetime: string };
type Ran = { form: PlanForm; windAt: string | null; at: string };
const ring = (p: { coordinates: number[][][] }): Array<[number, number]> => p.coordinates[0].map(([lon, lat]) => [lon, lat] as [number, number]);

/** Planning aid for the Control Room only (D4 section 4). It never says what will happen, and saving it changes nothing about the incident. */
export function ScenarioTab({ incidentId, lat, lon, staleMinutes, radii }: { incidentId: number; lat: number; lon: number; staleMinutes: number | null; radii: number[] | null }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const start = useMemo(() => ({ lat, lon }), [lat, lon]);
  const [form, setForm] = useState<PlanForm>(EMPTY_FORM);
  const [ran, setRan] = useState<Ran | null>(null);
  const [windAt, setWindAt] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [assets, setAssets] = useState<Asset[]>([]);
  const [asset, setAsset] = useState({ name: '', lat: '', lon: '' });
  const [shown, setShown] = useState<string>('');
  const set = (key: keyof PlanForm) => (event: { target: { value: string } }) => setForm(current => ({ ...current, [key]: event.target.value }));

  const parsed = ran ? parsePlan(ran.form, start) : null;
  const bands = useMemo(() => (parsed && parsed.ok ? runPlan(parsed.plan) : []), [parsed]);
  const errors = shown ? parsePlan(form, start) : null;
  const rows = useMemo(() => reachTable(start, bands), [start, bands]);
  const outdated = isOutdated(ran && { form: ran.form, windAt: ran.windAt }, form, staleMinutes);

  const signals = useQuery({
    queryKey: ['scenario-signals', lat, lon], enabled: !!ran, retry: false,
    queryFn: () => api<{ items: Signal[] }>(`/api/hotspots?min_lat=${lat - 0.5}&max_lat=${lat + 0.5}&min_lon=${lon - 0.5}&max_lon=${lon + 0.5}&since_hours=24`),
  });
  const observations: Observation[] = useMemo(() => (signals.data?.items ?? []).map(s => ({ lat: s.latitude, lon: s.longitude, observedAt: s.acq_datetime, kind: 'signal' as const })), [signals.data]);
  const check = bands.length ? realityCheck(bands[bands.length - 1].outer, observations) : null;
  const exposure = bands.length && assets.length ? assessExposure(bands, assets) : [];

  const polygons: MapPolygon[] = bands.flatMap(b => [
    { id: `outer-${b.hour}`, ring: ring(b.outer), tone: 'band' as const, hour: b.hour },
    { id: `nominal-${b.hour}`, ring: ring(b.nominal), tone: 'envelope' as const, hour: b.hour, label: `${b.hour} h` },
    { id: `inner-${b.hour}`, ring: ring(b.inner), tone: 'band' as const, hour: b.hour },
  ]);
  const points: MapPoint[] = [
    { id: 'ignition', lat, lon, symbol: 'report', label: t('ops.scn.ignition', 'Reported place') },
    ...(ran ? (signals.data?.items ?? []).map(s => ({ id: `s-${s.id}`, lat: s.latitude, lon: s.longitude, symbol: 'signal' as const })) : []),
    ...assets.map(a => ({ id: `a-${a.id}`, lat: a.lat, lon: a.lon, symbol: 'task' as const, label: a.name })),
  ];

  const wind = useMutation({
    mutationFn: () => api<Wind>(`/api/weather/context?lat=${lat}&lon=${lon}`),
    onSuccess: w => { setForm(current => ({ ...current, windKmh: String(msToKmh(w.wind_speed_ms)), windFrom: String(Math.round(w.wind_dir_deg)) })); setWindAt(w.valid_time); },
  });
  const save = useMutation({
    mutationFn: () => api(`/api/ops/incidents/${incidentId}/scenario-notes`, { method: 'POST', json: { inputs: { ...ran!.form, windReadingAt: ran!.windAt }, results: { rows, outsideSignals: check?.outside.length ?? 0, status: check?.status ?? 'consistent', exposure: exposure.map(e => ({ name: e.asset.name, outerHour: e.earliestInOuterHour, innerHour: e.earliestInInnerHour })) }, note } }),
    onSuccess: () => { setNote(''); void queryClient.invalidateQueries({ queryKey: ['ops-history'] }); },
  });

  const run = () => {
    setShown('1');
    const result = parsePlan(form, start);
    if (!result.ok) return;
    setRan({ form: { ...form }, windAt, at: new Date().toISOString() });
  };
  const addAsset = () => {
    const a = Number(asset.lat), o = Number(asset.lon);
    if (!asset.name.trim() || !Number.isFinite(a) || !Number.isFinite(o) || Math.abs(a) > 90 || Math.abs(o) > 180) return;
    setAssets(list => [...list, { id: String(list.length + 1), name: asset.name.trim(), kind: 'place', lat: a, lon: o }]);
    setAsset({ name: '', lat: '', lon: '' });
  };
  const msg = (key: keyof PlanForm) => (errors && !errors.ok ? errors.errors[key] : undefined);

  return (
    <div className="space-y-4">
      <Notice kind="warning" title={t('ops.scn.not_validated', 'Not validated. A planning aid, not a forecast.')}>
        {t('ops.scn.limits', 'It draws how far a fire could reach under the numbers you type. It does not model spotting, crowning or changes in fuel moisture. It does not say whether there is a fire and it never says what will burn. Do not use it to decide that a place is safe.')}
      </Notice>

      <Card title={t('ops.scn.inputs', 'Numbers you type')}>
        <p className="mb-3 text-sm text-ink-muted">{t('ops.scn.no_defaults', 'Nothing is filled in for you. Take the rate of spread from your own fuel and weather assessment.')}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextField label={t('ops.scn.ros', 'Head-fire rate of spread (km/h)')} inputMode="decimal" value={form.ros} onChange={set('ros')} error={msg('ros')} />
          <SelectField label={t('ops.scn.hours', 'Show up to')} value={form.hours} onChange={set('hours')} error={msg('hours')}>
            <option value="">{t('citizen.report.choose', 'Choose')}</option>{[1, 3, 6, 12, 24].map(h => <option key={h} value={h}>{h} h</option>)}
          </SelectField>
          <TextField label={t('ops.scn.wind', 'Wind speed (km/h)')} inputMode="decimal" value={form.windKmh} onChange={event => { set('windKmh')(event); setWindAt(null); }} error={msg('windKmh')} />
          <TextField label={t('ops.scn.from', 'Wind blows from (degrees)')} inputMode="decimal" value={form.windFrom} onChange={event => { set('windFrom')(event); setWindAt(null); }} error={msg('windFrom')} hint={t('ops.scn.from_hint', '0 is north, 90 is east. A west wind is 270.')} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button variant="secondary" loading={wind.isPending} onClick={() => wind.mutate()}>{t('ops.scn.use_reading', 'Fill wind from the latest reading')}</Button>
          {windAt && <span className="text-sm text-ink-muted">{t('ops.scn.reading_at', 'Reading valid {{when}}', { when: new Date(windAt).toLocaleString() })}</span>}
          {wind.isError && <span role="alert" className="text-sm font-semibold text-danger">{t('ops.scn.no_reading', 'No wind reading is available. Type the wind yourself.')}</span>}
        </div>
        <h3 className="mt-5 font-bold">{t('ops.scn.uncertainty', 'How sure are you? (drawn as bands)')}</h3>
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          <TextField label={t('ops.scn.u_speed', 'Wind speed ± (%)')} inputMode="decimal" value={form.speedPct} onChange={set('speedPct')} error={msg('speedPct')} />
          <TextField label={t('ops.scn.u_dir', 'Wind direction ± (degrees)')} inputMode="decimal" value={form.dirDeg} onChange={set('dirDeg')} error={msg('dirDeg')} />
          <TextField label={t('ops.scn.u_ros', 'Rate of spread ± (%)')} inputMode="decimal" value={form.rosPct} onChange={set('rosPct')} error={msg('rosPct')} />
        </div>
        <div className="mt-4"><Button onClick={run}>{t('ops.scn.run', 'Draw scenario')}</Button></div>
      </Card>

      {ran && (
        <>
          {outdated && <Notice kind="warning" title={t('ops.scn.outdated', 'Outdated')}>{t('ops.scn.outdated_why', 'An input has changed, or the wind reading is older than the limit, since this was drawn. Draw it again before using it.')}</Notice>}
          {check?.status === 'unreliable' && <Notice kind="danger" title={t('ops.scn.unreliable', 'Observations are outside this scenario. Treat it as unreliable.')}>{t('ops.scn.unreliable_why', 'Field observations lie outside the outer band.')}</Notice>}
          {check && check.status === 'consistent' && check.outside.length > 0 && <Notice kind="warning">{t('ops.scn.signals_outside', '{{n}} satellite signals (not confirmed) lie outside the outer band.', { n: check.outside.length })}</Notice>}
          <MapView label={t('ops.scn.map', 'Scenario map')} points={points} polygons={polygons} bounds={null} center={[lon, lat]} zoom={9} className="h-[55vh] min-h-72" />
          <Legend kinds={['report', 'signal', 'task']} />
          <p className="text-sm text-ink-muted">{t('ops.scn.bands_key', 'Dashed outline: the numbers you typed, at each hour. Dotted outlines: the smallest and largest reach within your stated uncertainty. There is no single line to trust.')}</p>
          <Card title={t('ops.scn.reach', 'How far, in a straight line from the reported place')}>
            <table className="w-full text-sm"><caption className="sr-only">{t('ops.scn.reach', 'Reach')}</caption>
              <thead><tr className="text-left"><th scope="col" className="py-1">{t('ops.scn.hour', 'Hour')}</th><th scope="col">{t('ops.scn.smallest', 'Smallest')}</th><th scope="col">{t('ops.scn.typed', 'As typed')}</th><th scope="col">{t('ops.scn.largest', 'Largest')}</th></tr></thead>
              <tbody>{rows.map(r => <tr key={r.hour} className="border-t border-line"><th scope="row" className="py-1 text-left">{r.hour} h</th><td>{r.innerKm.toFixed(1)} km</td><td>{r.nominalKm.toFixed(1)} km</td><td>{r.outerKm.toFixed(1)} km</td></tr>)}</tbody>
            </table>
            {radii && <p className="mt-2 text-sm text-ink-muted">{t('ops.scn.radii', 'Distances your department set for exposure checks: {{list}} km.', { list: radii.join(', ') })}</p>}
          </Card>
          <Card title={t('ops.scn.exposure', 'Places that could be reached')}>
            <p className="mb-2 text-sm text-ink-muted">{t('ops.scn.exposure_hint', 'Add places you know of (a village, a road junction, a water point). The earliest hour shown is the earliest the outer band reaches it. It is a range for planning, not a prediction.')}</p>
            <div className="grid gap-2 sm:grid-cols-4">
              <TextField label={t('ops.scn.place_name', 'Place name')} value={asset.name} onChange={event => setAsset(a => ({ ...a, name: event.target.value }))} />
              <TextField label={t('ops.scn.place_lat', 'Latitude')} inputMode="decimal" value={asset.lat} onChange={event => setAsset(a => ({ ...a, lat: event.target.value }))} />
              <TextField label={t('ops.scn.place_lon', 'Longitude')} inputMode="decimal" value={asset.lon} onChange={event => setAsset(a => ({ ...a, lon: event.target.value }))} />
              <div className="flex items-end"><Button variant="secondary" onClick={addAsset}>{t('ops.scn.add_place', 'Add place')}</Button></div>
            </div>
            {exposure.length > 0 && (
              <table className="mt-3 w-full text-sm"><caption className="sr-only">{t('ops.scn.exposure', 'Exposure')}</caption>
                <thead><tr className="text-left"><th scope="col">{t('ops.scn.place_name', 'Place name')}</th><th scope="col">{t('ops.scn.earliest', 'Earliest in outer band')}</th><th scope="col">{t('ops.scn.earliest_inner', 'Earliest in inner band')}</th></tr></thead>
                <tbody>{exposure.map(e => <tr key={e.asset.id} className="border-t border-line"><th scope="row" className="py-1 text-left">{e.asset.name}</th><td>{e.earliestInOuterHour === null ? t('ops.scn.not_reached', 'Not reached in the hours shown') : `${e.earliestInOuterHour} h`}</td><td>{e.earliestInInnerHour === null ? '—' : `${e.earliestInInnerHour} h`}</td></tr>)}</tbody>
              </table>)}
          </Card>
          <Card title={t('ops.scn.save', 'Keep for the briefing')}>
            <TextArea label={t('ops.scn.note', 'Note (optional)')} maxLength={1000} value={note} onChange={event => setNote(event.target.value)} />
            <div className="mt-3 flex items-center gap-3">
              <Button loading={save.isPending} disabled={outdated} onClick={() => save.mutate()}>{t('ops.scn.save_button', 'Save to timeline')}</Button>
              {save.isSuccess && <span role="status" className="font-semibold">{t('ops.scn.saved', 'Saved. Nothing about the incident was changed and no one was notified.')}</span>}
              {save.isError && <span role="alert" className="font-semibold text-danger">{save.error instanceof ApiError ? save.error.message : t('common.try_again', 'Could not save. Try again.')}</span>}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
