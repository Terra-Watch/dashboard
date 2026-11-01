import { useQuery } from '@tanstack/react-query';
import { Phone, Plus, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
import { API } from '../../app/config';
import { Card, EmptyState, PageTitle, Skeleton } from '../../ui/Page';
import { Notice } from '../../ui/Notice';
import { EmergencyStrip } from '../../ui/EmergencyStrip';
import { SelectField } from '../../ui/Field';
import { RungBadge } from '../../ui/RungBadge';
import { ageText, type Rung } from '../../ui/ladder';
import { cellToBoundary } from 'h3-js';
import { Legend } from '../map/Legend';
import { MapView } from '../map/MapView';
import { boundsOf, type MapPoint, type MapPolygon } from '../map/geojson';
import { STATES, STATE_BOUNDS, formatWhen } from './format';

type Contact = { label: string; number: string; region?: string | null };
type NoticeItem = NoticeArea & { id: number; incident_id?: number | null; image_id?: number | null; title: string; body: string; severity: 'info' | 'advisory' | 'warning'; expires_at: string; published_at: string | null };
type NoticeArea = { id: number; title: string; severity: string; area_geojson?: { type: string; coordinates: number[][][] } | null };
type MyReport = { id: number; status: string; latitude: number; longitude: number };
type PublicReport = { id: number; label: 'unverified' | 'confirmed'; text: string; note: string | null; lat: number; lon: number; distance_km: number | null; reported_at: string; photos: string[] };
type PublicIncidents = { enabled: boolean; items: Array<{ cell: string; count: number; status: 'verified' | 'responding' | 'contained'; as_of: string }>; delay_minutes?: number };

const REGION_KEY = 'tw_region';
const rememberedRegion = () => { try { return localStorage.getItem(REGION_KEY) ?? ''; } catch { return ''; } };

function FlagPhoto({ incidentId, src }: { incidentId: number; src: string }) {
  const { t } = useTranslation();
  const [done, setDone] = useState(false);
  const imageId = src.split('/').pop();
  if (done) return <span className="text-sm text-ink-muted">{t('citizen.near.flag_thanks', 'Thank you. Officials will look at it.')}</span>;
  return <button type="button" onClick={() => void api(`/api/citizen/public-photos/${incidentId}/${imageId}/flag`, { method: 'POST' }).then(() => setDone(true)).catch(() => setDone(true))} className="min-h-11 text-sm font-semibold underline">{t('citizen.near.flag', 'Report this photo')}</button>;
}

function ReportCard({ item }: { item: PublicReport }) {
  const { t } = useTranslation();
  return (
              <div className={`rounded-rq border-l-4 p-3 ${item.label === 'confirmed' ? 'border-danger bg-danger-tint' : 'border-unconfirmed bg-unconfirmed-tint'}`}>
                <p className="text-sm font-bold uppercase tracking-wide">{item.label === 'confirmed' ? t('citizen.near.confirmed', 'Confirmed by officials') : t('citizen.near.unverified', 'Unverified')}</p>
                <p className="mt-1">{item.label === 'confirmed' ? t('citizen.near.confirmed_text', 'Fire reported and confirmed by officials.') : t('citizen.near.unverified_text', 'Reported by a citizen. Not checked by officials.')}</p>
                {item.note && <p className="mt-1 italic">“{item.note}”</p>}
                {item.photos.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{item.photos.map(src => <figure key={src} className="max-w-full"><img src={`${API}${src}`} alt={t('citizen.near.photo_alt', 'Photo sent by a citizen, not checked by officials')} loading="lazy" className="h-32 w-auto max-w-full rounded-lg border border-line object-cover" /><figcaption><FlagPhoto incidentId={item.id} src={src} /></figcaption></figure>)}</div>}
                <p className="mt-2 text-sm text-ink-muted">{formatWhen(item.reported_at)}{item.distance_km !== null ? ` · ${t('citizen.near.km_away', { count: item.distance_km, defaultValue: 'about {{count}} km away' })}` : ''}{` · ${t('citizen.near.area_only', 'area only, not the exact place')}`}</p>
              </div>
  );
}

export function NearMePage() {
  const { t } = useTranslation();
  const [region, setRegion] = useState(rememberedRegion);
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api<{ configured: boolean; items: Contact[] }>('/api/public/contacts') });
  const notices = useQuery({ queryKey: ['notices', region], queryFn: () => api<{ items: NoticeItem[] }>(`/api/notices${region ? `?region=${region}` : ''}`) });
  const mine = useQuery({ queryKey: ['my-report-points'], queryFn: () => api<{ items: MyReport[] }>('/api/citizen/reports'), retry: false });
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const reports = useQuery({
    queryKey: ['public-reports', me?.lat?.toFixed(2), me?.lon?.toFixed(2)], refetchInterval: 25_000, retry: false,
    queryFn: () => api<{ enabled: boolean; items: PublicReport[] }>(`/api/public/reports${me ? `?lat=${me.lat}&lon=${me.lon}&radius_km=50` : ''}`),
  });
  const areas = useQuery({ queryKey: ['public-incidents'], queryFn: () => api<PublicIncidents>('/api/public/incidents') });

  const polygons: MapPolygon[] = [
    ...(areas.data?.enabled ? areas.data.items.map(item => ({ id: item.cell, ring: cellToBoundary(item.cell, true) as Array<[number, number]>, tone: 'cell' as const })) : []),
    ...(notices.data?.items ?? []).filter(item => item.area_geojson?.coordinates?.[0]).map(item => ({ id: `n${item.id}`, ring: item.area_geojson!.coordinates[0] as Array<[number, number]>, tone: item.severity === 'warning' ? 'warning' as const : 'advisory' as const })),
  ];
  const points: MapPoint[] = [
    ...(mine.data?.items ?? []).filter(item => item.latitude != null).map(item => ({ id: `r${item.id}`, lat: item.latitude, lon: item.longitude, symbol: 'report' as const, label: `#${item.id}` })),
    ...(reports.data?.enabled ? reports.data.items.map(item => ({ id: `u${item.id}`, lat: item.lat, lon: item.lon, symbol: 'report' as const, label: item.label === 'unverified' ? t('citizen.near.unverified_short', 'Unverified') : `#${item.id}` })) : []),
    ...(me ? [{ id: 'me', lat: me.lat, lon: me.lon, symbol: 'me' as const }] : []),
  ];
  const pickedReport = selected?.startsWith('u') ? reports.data?.items.find(item => item.id === Number(selected.slice(1))) : undefined;
  const pickedMine = selected?.startsWith('r') ? mine.data?.items.find(item => item.id === Number(selected.slice(1))) : undefined;
  const nearbyCount = (notices.data?.items.length ?? 0) + (areas.data?.enabled ? areas.data.items.length : 0);
  const hasNearby = nearbyCount > 0;
  const box = region ? STATE_BOUNDS[region] : null;
  const bounds = me ? boundsOf([me]) : polygons.length || points.length ? boundsOf([...polygons.flatMap(p => p.ring.map(([lon, lat]) => ({ lat, lon }))), ...points]) : box ? [[box[0], box[1]], [box[2], box[3]]] as [[number, number], [number, number]] : null;
  const locate = () => navigator.geolocation?.getCurrentPosition(position => setMe({ lat: position.coords.latitude, lon: position.coords.longitude }), () => undefined, { enableHighAccuracy: true, timeout: 15000 });

  // A person opening this screen wants to know about their own surroundings: ask for the place straight away.
  useEffect(() => { locate(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageTitle title={t('citizen.near.title', 'Near me')} subtitle={t('citizen.near.subtitle', 'What is official and verified in your area.')}
        actions={<Link to="/citizen/report" className="inline-flex min-h-12 items-center gap-2 rounded-rq bg-action px-5 text-lg font-bold text-on-action hover:bg-action-strong"><Plus aria-hidden="true" size={20} />{t('nav.report')}</Link>} />

      <div role="status" className={`flex items-start gap-3 rounded-xl border p-4 ${hasNearby ? 'border-warn bg-warn-tint' : 'border-line bg-surface'}`}>
        <ShieldCheck aria-hidden="true" className={`mt-0.5 shrink-0 ${hasNearby ? 'text-warn' : 'text-ink-muted'}`} size={26} />
        <div>
          <p className="text-lg font-bold">{hasNearby ? t('citizen.v2.near_some', { count: nearbyCount, defaultValue: '{{count}} official items for your area' }) : t('citizen.v2.near_none', 'No official fire items for your area right now')}</p>
          <p className="text-sm text-ink-muted">{t('citizen.near.absence', 'Nothing shown here does not mean there is no fire. If you see smoke, report it.')}</p>
        </div>
      </div>

      <EmergencyStrip />

      <Card title={t('citizen.near.contacts', 'Emergency contacts')}>
        {contacts.isLoading ? <Skeleton lines={1} /> : !contacts.data?.configured || !contacts.data.items.length
          ? <p>{t('citizen.near.no_contacts', 'No numbers have been set up for this service yet. In an emergency contact your local emergency services.')}</p>
          : <ul className="space-y-2">{contacts.data.items.map(item => <li key={item.label + item.number}><a href={`tel:${item.number.replace(/[^+0-9]/g, '')}`} className="flex min-h-12 items-center gap-3 rounded-rq border border-control px-4 font-semibold text-ink hover:bg-surface-2"><Phone aria-hidden="true" size={20} /><span>{item.label}</span><span className="ml-auto">{item.number}</span></a></li>)}</ul>}
      </Card>

      <SelectField label={t('citizen.near.region', 'Your state')} value={region} onChange={event => { setRegion(event.target.value); try { localStorage.setItem(REGION_KEY, event.target.value); } catch { /* remembered for this visit only */ } }}>
        <option value="">{t('citizen.near.all', 'All states')}</option>
        {STATES.map(state => <option key={state.code} value={state.code}>{state.name}</option>)}
      </SelectField>

      <Card title={t('citizen.near.map', 'Map')}>
        <div className="relative">
          <MapView label={t('citizen.near.map', 'Map')} points={points} polygons={polygons} bounds={bounds} className="h-80" selectedId={selected} onSelect={setSelected} />
          {pickedReport && (
            <div className="absolute inset-x-2 bottom-2 z-10 max-h-[90%] overflow-auto rounded-panel border border-line bg-surface p-3 shadow-lg">
              <button type="button" onClick={() => setSelected(null)} aria-label={t('map.close', 'Close')} className="absolute right-2 top-2 z-10 flex size-10 items-center justify-center rounded-full border border-line bg-surface text-xl leading-none">×</button>
              <ReportCard item={pickedReport} />
            </div>)}
          {pickedMine && (
            <div className="absolute inset-x-2 bottom-2 z-10 rounded-panel border border-line bg-surface p-3 shadow-lg">
              <button type="button" onClick={() => setSelected(null)} aria-label={t('map.close', 'Close')} className="absolute right-2 top-2 flex size-10 items-center justify-center rounded-full border border-line bg-surface text-xl leading-none">×</button>
              <p className="font-bold">{t('citizen.near.your_report', 'Your report')} #{pickedMine.id}</p>
              <Link to={`/citizen/reports/${pickedMine.id}`} className="mt-2 inline-flex min-h-11 items-center rounded-rq bg-action px-4 font-bold text-on-action">{t('citizen.near.open_report', 'See its photos and steps')}</Link>
            </div>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={locate} className="min-h-11 rounded-rq border border-control px-4 font-semibold hover:bg-surface-2">{t('field.use_position', 'Show my position')}</button><p className="text-sm text-ink-muted">{t('citizen.near.map_note', 'Only verified areas, official notice areas and your own reports are shown. Your reports are private to you.')}</p></div>
        <div className="mt-3"><Legend kinds={['report', 'me']} /></div>
      </Card>

      {reports.data?.enabled && (
        <Card title={t('citizen.near.reports', 'Reports from people nearby')}>
          {!reports.data.items.length ? <p>{t('citizen.near.no_reports', 'No reports with photos nearby right now.')}</p>
            : <ul className="space-y-3">{reports.data.items.map(item => (
              <li key={item.id}><ReportCard item={item} /></li>))}</ul>}
          <p className="mt-3 text-sm text-ink-muted">{t('citizen.near.reports_safety', 'Stay clear of smoke and fire. If anyone is in danger, call the emergency number.')}</p>
        </Card>
      )}

      <Card title={t('citizen.near.notices', 'Official notices')}>
        {notices.isLoading ? <Skeleton /> : notices.isError ? <Notice kind="warning">{t('citizen.near.notices_error', 'Notices could not be loaded. Try again in a moment.')}</Notice>
          : !notices.data?.items.length ? <EmptyState title={t('citizen.near.no_notices', 'No official notices for this area right now.')}>{t('citizen.near.no_notices_hint', 'Official notices appear here when the Control Room publishes them.')}</EmptyState>
          : <ul className="space-y-3">{notices.data.items.map(item => (
              <li key={item.id} className={`rounded-rq border-l-4 p-3 ${item.severity === 'warning' ? 'border-danger bg-danger-tint' : item.severity === 'advisory' ? 'border-warn bg-warn-tint' : 'border-action bg-action-tint'}`}>
                <p className="text-sm font-bold uppercase tracking-wide">{t(`citizen.severity.${item.severity}`, item.severity)}</p>
                <h3 className="text-lg">{item.title}</h3><p className="mt-1 whitespace-pre-wrap">{item.body}</p>
                {item.incident_id && item.image_id ? <img src={`${API}/api/public/reports/${item.incident_id}/photos/${item.image_id}`} alt={t('citizen.near.notice_photo', 'Photo from the incident, shown by officials')} loading="lazy" className="mt-2 h-40 w-auto max-w-full rounded-lg border border-line object-cover" /> : null}
                <p className="mt-2 text-sm text-ink-muted">{formatWhen(item.published_at)} · {t('citizen.near.until', 'until')} {formatWhen(item.expires_at)}</p>
              </li>))}</ul>}
      </Card>

      <Card title={t('citizen.near.verified', 'Verified fire areas')}>
        {areas.isLoading ? <Skeleton lines={2} /> : !areas.data?.enabled ? <p className="text-ink-muted">{t('landing.hero.status_none')}</p>
          : !areas.data.items.length ? <p>{t('citizen.near.none_verified', 'No verified fire areas are being shown right now.')}</p>
          : <ul className="space-y-2">{areas.data.items.map(item => <li key={item.cell} className="flex flex-wrap items-center justify-between gap-2 rounded-rq border border-line p-3"><RungBadge rung={item.status as Rung} age={ageText(item.as_of)} /><span className="text-sm text-ink-muted">{t('citizen.near.area_count', { count: item.count, defaultValue: '{{count}} reported here' })}</span></li>)}</ul>}
        <p className="mt-3 text-sm text-ink-muted">{t('citizen.near.absence', 'Nothing shown here does not mean there is no fire. If you see smoke, report it.')}{areas.data?.enabled && areas.data.delay_minutes !== undefined ? ` ${t('citizen.near.delay', { minutes: areas.data.delay_minutes, defaultValue: 'Shown with a delay of {{minutes}} minutes.' })}` : ''}</p>
      </Card>

    </div>
  );
}
