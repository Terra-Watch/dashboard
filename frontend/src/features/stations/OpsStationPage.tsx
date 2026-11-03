import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { ApiError } from '../../app/http';
import { Button } from '../../ui/Button';
import { TextArea } from '../../ui/Field';
import { Notice } from '../../ui/Notice';
import { Card, LoadError, PageTitle, Skeleton } from '../../ui/Page';
import { ageText } from '../../ui/ladder';
import { Chart } from './Chart';
import { useCreateCheck, useNearby, useStation } from './api';
import { fmt, ageLabel } from './model';
import { Readings, Sounds, StatusChip } from './parts';

/** One station: current readings against its own normal, trend, link health, what else is near it, and the way to turn it into a check. */
export function OpsStationPage() {
  const { t } = useTranslation();
  const id = Number(useParams().id);
  const [hours, setHours] = useState(24);
  const q = useStation(id, hours); const near = useNearby(id); const check = useCreateCheck(id);
  const [open, setOpen] = useState(false); const [note, setNote] = useState('');
  const s = q.data?.station;
  if (q.isError) return <div className="mx-auto max-w-5xl space-y-4"><Link to="/ops/stations" className="font-semibold underline">{t('stations.back', 'All stations')}</Link><LoadError message={q.error instanceof ApiError && q.error.status === 404 ? t('stations.not_found', 'This station was not found, or it is outside your area.') : t('stations.load_failed', 'The stations could not be loaded.')} onRetry={() => void q.refetch()} /></div>;
  if (!s) return <div className="mx-auto max-w-5xl"><Skeleton lines={5} /></div>;
  const series = q.data!.series; const times = series.map(p => p.t);
  const result = check.data;
  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <Link to="/ops/stations" className="inline-flex min-h-11 items-center font-semibold underline">{t('stations.back', 'All stations')}</Link>
      <PageTitle title={s.name} subtitle={q.data!.label} actions={<StatusChip s={s} />} />
      <p className="text-sm text-ink-muted">{s.state} · {t('stations.node', { n: s.node_id, defaultValue: 'node {{n}}' })} · {s.latitude.toFixed(4)}, {s.longitude.toFixed(4)} · {t('stations.interval', { n: s.expected_interval_s, defaultValue: 'reports every {{n}} s' })}</p>
      {(s.status === 'late' || s.status === 'offline' || s.status === 'never') && <Notice kind="warning" title={t('stations.silent_title', 'This station is not reporting')}>{s.status === 'never' ? t('stations.never_msg', 'Nothing has been heard from it yet.') : t('stations.silent_msg', { age: ageLabel(s.age_s), defaultValue: 'Last heard {{age}} ago. Treat it as not reporting, not as quiet.' })}</Notice>}
      <Sounds items={q.data!.sounds} />
      <Readings s={s} />
      <Card title={t('stations.trend', 'Trend')}>
        <div role="group" aria-label={t('map.window', 'Time window')} className="mb-2 inline-flex rounded-rq border border-control p-1">
          {[[24, '24 h'], [168, '7 d']].map(([h, label]) => <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h as number)} className={`min-h-11 rounded-rq px-4 font-semibold ${hours === h ? 'bg-action text-on-action' : ''}`}>{label}</button>)}
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Chart label={t('stations.chart_pm', 'Smoke particles')} unit="µg/m³" times={times} lines={[{ name: 'PM2.5', values: series.map(p => p.pm25), className: 'text-action' }, { name: 'PM10', values: series.map(p => p.pm10), className: 'text-ink-muted' }]} />
          <Chart label={t('stations.chart_climate', 'Temperature and humidity')} unit="°C · %" times={times} lines={[{ name: t('stations.temp', 'Temperature'), values: series.map(p => p.temp_c), className: 'text-warn' }, { name: t('stations.humidity', 'Humidity'), values: series.map(p => p.humidity_pct), className: 'text-ok' }]} />
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title={t('stations.link', 'Link and health')}>
          <dl className="grid grid-cols-2 gap-1 text-sm"><dt className="text-ink-muted">{t('stations.signal', 'Signal')}</dt><dd>{fmt(s.rssi, 0, ' dBm')} · SNR {fmt(s.snr, 1)}</dd>
            <dt className="text-ink-muted">{t('stations.hops', 'Hops')}</dt><dd>{fmt(s.hops)}</dd><dt className="text-ink-muted">{t('stations.battery', 'Battery')}</dt><dd>{s.battery_mv === null ? t('stations.not_sent', 'not reported') : `${s.battery_mv} mV`}</dd>
            <dt className="text-ink-muted">{t('stations.last_heard', 'Last heard')}</dt><dd>{s.last_heard ? new Date(s.last_heard).toLocaleString() : '-'}</dd></dl>
        </Card>
        <Card title={t('stations.nearby', 'Near this station')}>
          {near.isLoading && <Skeleton lines={2} />}
          {near.data && <ul className="space-y-1 text-sm">
            <li>{t('stations.near_sat', { n: near.data.hotspots.count, defaultValue: '{{n}} satellite detections within 10 km in the last 24 h' })}{near.data.hotspots.items.slice(0, 3).map(h => <span key={h.id} className="ml-1 text-ink-muted">· {h.km} km, {ageText(h.at)}</span>)}</li>
            <li>{t('stations.near_inc', { n: near.data.incidents.count, defaultValue: '{{n}} open reports and checks within 10 km in the last 6 h' })}{near.data.incidents.items.slice(0, 3).map(i => <Link key={i.id} to={`/ops/incidents/${i.id}`} className="ml-1 underline">#{i.id}</Link>)}</li>
            <li>{t('stations.near_st', { n: near.data.stations.count, defaultValue: '{{n}} other stations within 20 km' })}{near.data.stations.items.slice(0, 3).map(o => <Link key={o.id} to={`/ops/stations/${o.id}`} className="ml-1 underline">{o.name} ({o.km} km, PM2.5 {fmt(o.pm25)})</Link>)}</li>
            <li><Link to="/ops/satellite" className="underline">{t('stations.open_sat', 'Open the satellite page')}</Link> · <Link to="/ops/map" className="underline">{t('stations.open_map', 'Open the map')}</Link></li>
          </ul>}
        </Card>
      </div>
      <Card title={t('stations.check_title', 'Create a check')}>
        {result ? <Notice kind="success">{result.created ? t('stations.check_made', 'Check created.') : t('stations.check_exists', 'A check for this station is already open.')} <Link className="font-bold underline" to={`/ops/incidents/${result.incident_id}`}>#{result.incident_id}</Link></Notice>
          : !open ? <Button onClick={() => setOpen(true)}>{t('stations.check_btn', 'Create a check')}</Button>
          : <form className="space-y-3" onSubmit={e => { e.preventDefault(); check.mutate(note); }}>
              <p className="text-sm">{t('stations.check_explain', 'This puts a check from this station in the queue, with the last readings attached. A person must still verify it.')}</p>
              <TextArea label={t('stations.check_note', 'Note (optional)')} rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
              {check.isError && <Notice kind="danger">{check.error instanceof ApiError ? check.error.detail : t('stations.check_failed', 'The check could not be created. Try again.')}</Notice>}
              <div className="flex gap-2"><Button type="submit" loading={check.isPending}>{t('stations.check_confirm', 'Create the check')}</Button><Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel', 'Cancel')}</Button></div>
            </form>}
      </Card>
    </div>
  );
}
