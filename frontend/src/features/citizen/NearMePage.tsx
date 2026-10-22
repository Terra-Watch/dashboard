import { useQuery } from '@tanstack/react-query';
import { Phone, Plus, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { api } from '../../app/http';
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
type NoticeItem = NoticeArea & { id: number; title: string; body: string; severity: 'info' | 'advisory' | 'warning'; expires_at: string; published_at: string | null };
type NoticeArea = { id: number; title: string; severity: string; area_geojson?: { type: string; coordinates: number[][][] } | null };
type MyReport = { id: number; status: string; latitude: number; longitude: number };
type PublicIncidents = { enabled: boolean; items: Array<{ cell: string; count: number; status: 'verified' | 'responding' | 'contained'; as_of: string }>; delay_minutes?: number };

const REGION_KEY = 'tw_region';
const rememberedRegion = () => { try { return localStorage.getItem(REGION_KEY) ?? ''; } catch { return ''; } };

export function NearMePage() {
  const { t } = useTranslation();
  const [region, setRegion] = useState(rememberedRegion);
  const contacts = useQuery({ queryKey: ['contacts'], queryFn: () => api<{ configured: boolean; items: Contact[] }>('/api/public/contacts') });
  const notices = useQuery({ queryKey: ['notices', region], queryFn: () => api<{ items: NoticeItem[] }>(`/api/notices${region ? `?region=${region}` : ''}`) });
  const mine = useQuery({ queryKey: ['my-report-points'], queryFn: () => api<{ items: MyReport[] }>('/api/citizen/reports'), retry: false });
  const [me, setMe] = useState<{ lat: number; lon: number } | null>(null);
  const areas = useQuery({ queryKey: ['public-incidents'], queryFn: () => api<PublicIncidents>('/api/public/incidents') });

  const polygons: MapPolygon[] = [
    ...(areas.data?.enabled ? areas.data.items.map(item => ({ id: item.cell, ring: cellToBoundary(item.cell, true) as Array<[number, number]>, tone: 'cell' as const })) : []),
    ...(notices.data?.items ?? []).filter(item => item.area_geojson?.coordinates?.[0]).map(item => ({ id: `n${item.id}`, ring: item.area_geojson!.coordinates[0] as Array<[number, number]>, tone: item.severity === 'warning' ? 'warning' as const : 'advisory' as const })),
  ];
  const points: MapPoint[] = [
    ...(mine.data?.items ?? []).filter(item => item.latitude != null).map(item => ({ id: `r${item.id}`, lat: item.latitude, lon: item.longitude, symbol: 'report' as const, label: `#${item.id}` })),
    ...(me ? [{ id: 'me', lat: me.lat, lon: me.lon, symbol: 'me' as const }] : []),
  ];
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
        <MapView label={t('citizen.near.map', 'Map')} points={points} polygons={polygons} bounds={bounds} className="h-80" />
        <div className="mt-3 flex flex-wrap items-center gap-3"><button type="button" onClick={locate} className="min-h-11 rounded-rq border border-control px-4 font-semibold hover:bg-surface-2">{t('field.use_position', 'Show my position')}</button><p className="text-sm text-ink-muted">{t('citizen.near.map_note', 'Only verified areas, official notice areas and your own reports are shown. Your reports are private to you.')}</p></div>
        <div className="mt-3"><Legend kinds={['report', 'me']} /></div>
      </Card>

      <Card title={t('citizen.near.notices', 'Official notices')}>
        {notices.isLoading ? <Skeleton /> : notices.isError ? <Notice kind="warning">{t('citizen.near.notices_error', 'Notices could not be loaded. Try again in a moment.')}</Notice>
          : !notices.data?.items.length ? <EmptyState title={t('citizen.near.no_notices', 'No official notices for this area right now.')}>{t('citizen.near.no_notices_hint', 'Official notices appear here when the Control Room publishes them.')}</EmptyState>
          : <ul className="space-y-3">{notices.data.items.map(item => (
              <li key={item.id} className={`rounded-rq border-l-4 p-3 ${item.severity === 'warning' ? 'border-danger bg-danger-tint' : item.severity === 'advisory' ? 'border-warn bg-warn-tint' : 'border-action bg-action-tint'}`}>
                <p className="text-sm font-bold uppercase tracking-wide">{t(`citizen.severity.${item.severity}`, item.severity)}</p>
                <h3 className="text-lg">{item.title}</h3><p className="mt-1 whitespace-pre-wrap">{item.body}</p>
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
