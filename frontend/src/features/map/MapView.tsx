import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isDark, readMapColors, type MapColors } from './colors';
import { polygonsToGeoJson, pointsToGeoJson, type MapPoint, type MapPolygon } from './geojson';
import { basemapStyle } from './style';
import { drawSymbol, SYMBOL_PIXEL_RATIO } from './symbols';
import type { SymbolKind } from './geojson';

type MapLibreMap = InstanceType<typeof maplibregl.Map>;
type ClickEvent = { point: [number, number] | { x: number; y: number }; lngLat: { lat: number; lng: number } };
type DataSource = { setData(data: unknown): void };
let protocolReady = false;
function ensureProtocol() {
  if (protocolReady) return;
  // The worker file is given to MapLibre explicitly so the dev server and the build both serve it from this site.
  maplibregl.setWorkerUrl(workerUrl);
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
  protocolReady = true;
}

const POINTS = 'tw-points', POINTS_SEL = 'tw-points-selected', POLY = 'tw-polygons';
const TONES = ['cell', 'advisory', 'warning', 'envelope', 'band', 'observed'] as const;

function toneStyle(tone: (typeof TONES)[number], c: MapColors): { color: string; fill: number; dash?: number[]; width: number } {
  switch (tone) {
    case 'cell': return { color: c.danger, fill: 0.22, width: 2 };
    case 'advisory': return { color: c.warn, fill: 0.16, dash: [2, 2], width: 2 };
    case 'warning': return { color: c.danger, fill: 0.14, dash: [2, 2], width: 2.5 };
    case 'envelope': return { color: c.unconfirmed, fill: 0.1, dash: [3, 2], width: 2 };
    case 'band': return { color: c.unconfirmed, fill: 0, dash: [1, 2], width: 1.5 };
    case 'observed': return { color: c.text, fill: 0, width: 2.5 };
  }
}

function install(map: MapLibreMap, colors: MapColors) {
  for (const id of [POINTS, POINTS_SEL]) if (map.getLayer(id)) map.removeLayer(id);
  for (const tone of TONES) for (const part of ['fill', 'line']) { const id = `${POLY}-${tone}-${part}`; if (map.getLayer(id)) map.removeLayer(id); }
  for (const id of [POINTS, POLY]) if (map.getSource(id)) map.removeSource(id);
  map.addSource(POLY, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource(POINTS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  for (const tone of TONES) {
    const s = toneStyle(tone, colors);
    const filter: ['==', ['get', string], string] = ['==', ['get', 'tone'], tone];
    if (s.fill > 0) map.addLayer({ id: `${POLY}-${tone}-fill`, type: 'fill', source: POLY, filter, paint: { 'fill-color': s.color, 'fill-opacity': s.fill } });
    map.addLayer({ id: `${POLY}-${tone}-line`, type: 'line', source: POLY, filter, paint: { 'line-color': s.color, 'line-width': s.width, ...(s.dash ? { 'line-dasharray': s.dash } : {}) } });
  }
  map.addLayer({ id: POINTS_SEL, type: 'circle', source: POINTS, filter: ['==', ['get', 'id'], '__none__'], paint: { 'circle-radius': 19, 'circle-color': colors.surface, 'circle-opacity': 0.0, 'circle-stroke-color': colors.action, 'circle-stroke-width': 3 } });
  map.addLayer({
    id: POINTS, type: 'symbol', source: POINTS,
    layout: { 'icon-image': ['get', 'symbol'], 'icon-allow-overlap': true, 'icon-size': 0.8, 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 1.7], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'icon-opacity': ['get', 'opacity'], 'text-color': colors.text, 'text-halo-color': colors.halo, 'text-halo-width': 1.6 },
  });
}

export type MapViewProps = {
  label: string;
  points?: MapPoint[]; polygons?: MapPolygon[];
  selectedId?: string | null; onSelect?: (id: string | null) => void;
  onMapClick?: (lat: number, lon: number) => void;
  bounds?: [[number, number], [number, number]] | null;
  center?: [number, number]; zoom?: number;
  className?: string; children?: ReactNode;
};

/** The one map. MapLibre GL, self-hosted PMTiles basemap, fonts and icons from this site (no third-party requests). */
export function MapView({ label, points = [], polygons = [], selectedId = null, onSelect, onMapClick, bounds, center = [84.5, 21], zoom = 6, className = 'h-[60vh] min-h-80', children }: MapViewProps) {
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const colorsRef = useRef<MapColors | null>(null);
  const handlers = useRef({ onSelect, onMapClick });
  handlers.current = { onSelect, onMapClick };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pointData = useMemo(() => pointsToGeoJson(points), [points]);
  const polygonData = useMemo(() => polygonsToGeoJson(polygons), [polygons]);

  useEffect(() => {
    if (!host.current) return;
    ensureProtocol();
    let colors = readMapColors(); colorsRef.current = colors;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({ container: host.current, style: basemapStyle(colors, isDark()), center, zoom, attributionControl: { compact: true }, cancelPendingTileRequestsWhileZooming: true, fadeDuration: reduceMotion ? 0 : 150, canvasContextAttributes: { preserveDrawingBuffer: true } });
    } catch { setFailed(true); return; }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    (map as unknown as { setMissingStyleImageResolver(resolver: (id: string) => void): void }).setMissingStyleImageResolver(id => { if (!map.hasImage(id)) map.addImage(id, drawSymbol(id as SymbolKind, colorsRef.current ?? colors), { pixelRatio: SYMBOL_PIXEL_RATIO }); });
    map.on('load', () => { install(map, colors); setReady(true); });
    map.on('error', (event: { error?: { message?: string } }) => { if (/pmtiles|resq-basemap|Failed to fetch/i.test(String(event.error?.message))) setFailed(true); });
    map.on('click', (event: ClickEvent) => {
      const hit = map.getLayer(POINTS) ? map.queryRenderedFeatures(event.point, { layers: [POINTS] })[0] : undefined;
      if (hit) handlers.current.onSelect?.(String(hit.properties?.id)); else { handlers.current.onSelect?.(null); handlers.current.onMapClick?.(event.lngLat.lat, event.lngLat.lng); }
    });
    map.on('mousemove', (event: ClickEvent) => { if (map.getLayer(POINTS)) map.getCanvas().style.cursor = map.queryRenderedFeatures(event.point, { layers: [POINTS] }).length ? 'pointer' : handlers.current.onMapClick ? 'crosshair' : ''; });
    const restyle = () => { colors = readMapColors(); colorsRef.current = colors; for (const kind of ['signal', 'report', 'verified', 'responding', 'contained', 'closed', 'officer', 'task', 'me']) if (map.hasImage(kind)) map.removeImage(kind); map.setStyle(basemapStyle(colors, isDark())); map.once('style.load', () => { install(map, colors); setReady(false); setReady(true); }); };
    window.addEventListener('tw-theme', restyle);
    const mq = window.matchMedia('(prefers-color-scheme: dark)'); mq.addEventListener('change', restyle);
    return () => { window.removeEventListener('tw-theme', restyle); mq.removeEventListener('change', restyle); map.remove(); mapRef.current = null; };
    // The map is created once; data and view changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { const map = mapRef.current; if (ready && map) (map.getSource(POINTS) as unknown as DataSource | undefined)?.setData(pointData); }, [ready, pointData]);
  useEffect(() => { const map = mapRef.current; if (ready && map) (map.getSource(POLY) as unknown as DataSource | undefined)?.setData(polygonData); }, [ready, polygonData]);
  useEffect(() => { const map = mapRef.current; if (ready && map?.getLayer(POINTS_SEL)) map.setFilter(POINTS_SEL, ['==', ['get', 'id'], selectedId ?? '__none__']); }, [ready, selectedId]);
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map || !bounds) return;
    map.fitBounds(bounds, { padding: 48, maxZoom: 13, animate: !window.matchMedia('(prefers-reduced-motion: reduce)').matches });
  }, [ready, bounds]);

  return (
    <div className={`relative overflow-hidden rounded-panel border border-line ${className}`}>
      <div ref={host} role="region" aria-label={label} aria-describedby="map-help" tabIndex={0} style={{ position: 'absolute', inset: 0 }} data-testid="map" data-ready={ready} data-points={pointData.features.length} data-polygons={polygonData.features.length} />
      <p id="map-help" className="sr-only">{t('map.help', 'Arrow keys move the map. Plus and minus zoom. The same information is listed beside the map.')}</p>
      {failed && <div role="alert" className="absolute inset-x-3 top-3 rounded-rq border border-warn bg-warn-tint p-3 text-sm text-ink">{t('map.failed', 'The map background could not be loaded. The list beside the map still works.')}</div>}
      {children}
    </div>
  );
}
