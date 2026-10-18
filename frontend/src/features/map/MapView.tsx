import * as maplibregl from 'maplibre-gl';
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { Protocol } from 'pmtiles';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { isDark, readMapColors, type MapColors } from './colors';
import { polygonsToGeoJson, pointsToGeoJson, riskCellsToGeoJson, type MapPoint, type MapPolygon, type RiskCell } from './geojson';
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

const POINTS = 'tw-points', POINTS_SEL = 'tw-points-selected', POLY = 'tw-polygons', RISK = 'tw-risk';
const LINES = 'tw-lines', IMAGE = 'tw-image';
const LINE_TONES = ['road', 'water', 'draft', 'fireline'] as const;
type Quad = [[number, number], [number, number], [number, number], [number, number]];
/** A georeferenced picture drawn under the symbols (used by the what-if page for the burned area). Corner order: top-left, top-right, bottom-right, bottom-left. */
export type MapImageOverlay = { url: string; coordinates: Quad; opacity?: number };
/** A line drawn under the symbols. Tones: road, water, draft (being drawn) and fireline (a drawn fire line). */
export type MapLine = { id: string; coords: Array<[number, number]>; tone: (typeof LINE_TONES)[number] };
type MapLibreMapInstance = InstanceType<typeof maplibregl.Map>;

function lineStyle(tone: (typeof LINE_TONES)[number], c: MapColors): { color: string; width: number; dash?: number[]; casing?: string } {
  switch (tone) {
    case 'road': return { color: c.muted, width: 1.5 };
    case 'water': return { color: c.boundary, width: 2.5, dash: [1, 1.5] };
    case 'draft': return { color: c.text, width: 3, dash: [2, 2] };
    case 'fireline': return { color: c.text, width: 4, casing: c.surface };
  }
}

function installExtras(map: MapLibreMap, colors: MapColors) {
  for (const tone of LINE_TONES) for (const part of ['casing', 'line']) { const id = `${LINES}-${tone}-${part}`; if (map.getLayer(id)) map.removeLayer(id); }
  if (map.getLayer(IMAGE)) map.removeLayer(IMAGE);
  for (const id of [LINES, IMAGE]) if (map.getSource(id)) map.removeSource(id);
  map.addSource(LINES, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  for (const tone of LINE_TONES) {
    const s = lineStyle(tone, colors);
    const filter: ['==', ['get', string], string] = ['==', ['get', 'tone'], tone];
    if (s.casing) map.addLayer({ id: `${LINES}-${tone}-casing`, type: 'line', source: LINES, filter, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': s.casing, 'line-width': s.width + 3 } });
    map.addLayer({ id: `${LINES}-${tone}-line`, type: 'line', source: LINES, filter, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': s.color, 'line-width': s.width, ...(s.dash ? { 'line-dasharray': s.dash } : {}) } });
  }
}
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
  console.log('[DEBUG install] Installing sources and layers');
  for (const id of [POINTS, POINTS_SEL]) if (map.getLayer(id)) map.removeLayer(id);
  for (const tone of TONES) for (const part of ['fill', 'line']) { const id = `${POLY}-${tone}-${part}`; if (map.getLayer(id)) map.removeLayer(id); }
  if (map.getLayer(RISK)) map.removeLayer(RISK);
  if (map.getLayer(`${RISK}-outline`)) map.removeLayer(`${RISK}-outline`);
  for (const id of [POINTS, POLY, RISK]) if (map.getSource(id)) map.removeSource(id);
  
  console.log('[DEBUG install] Adding sources');
  map.addSource(POLY, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource(POINTS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addSource(RISK, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  console.log('[DEBUG install] Sources added:', map.getSource(RISK) ? 'SUCCESS' : 'FAILED');
  
  // Add polygon layers first (bottom)
  for (const tone of TONES) {
    const s = toneStyle(tone, colors);
    const filter: ['==', ['get', string], string] = ['==', ['get', 'tone'], tone];
    if (s.fill > 0) map.addLayer({ id: `${POLY}-${tone}-fill`, type: 'fill', source: POLY, filter, paint: { 'fill-color': s.color, 'fill-opacity': s.fill } });
    map.addLayer({ id: `${POLY}-${tone}-line`, type: 'line', source: POLY, filter, paint: { 'line-color': s.color, 'line-width': s.width, ...(s.dash ? { 'line-dasharray': s.dash } : {}) } });
  }
  
  // Risk layer: graduated circles with two-tone outline (dark outer, white inner)
  // Outer dark ring layer (bottom)
  map.addLayer({
    id: `${RISK}-outline`,
    type: 'circle',
    source: RISK,
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        5, 5,    // At zoom 5, outer ring is 5px
        9, 9,    // At zoom 9, outer ring is 9px  
        11, 13   // At zoom 11, outer ring is 13px
      ],
      'circle-color': colors.text,  // Dark outline using text token
      'circle-opacity': 0.85,
    },
  });
  
  // Main risk circle layer with white inner stroke (on top of outline)
  map.addLayer({
    id: RISK,
    type: 'circle',
    source: RISK,
    paint: {
      'circle-radius': [
        'interpolate', ['linear'], ['zoom'],
        5, 4,    // At zoom 5, circles are 4px
        9, 8,    // At zoom 9, circles are 8px
        11, 12   // At zoom 11, circles are 12px
      ],
      'circle-color': [
        'match', ['get', 'band'],
        'Very high', colors.outlook5,
        'High', colors.outlook4,
        'Moderate', colors.outlook3,
        'Low', colors.outlook2,
        colors.outlook1  // Fallback
      ],
      'circle-opacity': 0.7,
      'circle-stroke-width': 2,
      'circle-stroke-color': colors.surface,  // White/light inner stroke
    },
  });
  
  installExtras(map, colors);

  // Point symbols and selection on top
  map.addLayer({ id: POINTS_SEL, type: 'circle', source: POINTS, filter: ['==', ['get', 'id'], '__none__'], paint: { 'circle-radius': 19, 'circle-color': colors.surface, 'circle-opacity': 0.0, 'circle-stroke-color': colors.action, 'circle-stroke-width': 3 } });
  map.addLayer({
    id: POINTS, type: 'symbol', source: POINTS,
    layout: { 'icon-image': ['get', 'symbol'], 'icon-allow-overlap': true, 'icon-size': 0.8, 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Medium'], 'text-size': 12, 'text-offset': [0, 1.7], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'icon-opacity': ['get', 'opacity'], 'text-color': colors.text, 'text-halo-color': colors.halo, 'text-halo-width': 1.6 },
  });
}

export type MapViewProps = {
  label: string;
  points?: MapPoint[]; polygons?: MapPolygon[]; riskCells?: RiskCell[];
  selectedId?: string | null; onSelect?: (id: string | null) => void;
  onMapClick?: (lat: number, lon: number) => void;
  bounds?: [[number, number], [number, number]] | null;
  center?: [number, number]; zoom?: number;
  className?: string; children?: ReactNode;
  basemapStyle?: object | null;
  /** Additive, for the what-if page. */
  imageOverlay?: MapImageOverlay | null; lines?: MapLine[];
  onMapReady?: (map: MapLibreMapInstance) => void;
  onMapDoubleClick?: (lat: number, lon: number) => void;
  doubleClickZoom?: boolean;
};

/** The one map. MapLibre GL, self-hosted PMTiles basemap, fonts and icons from this site (no third-party requests). */
export function MapView({ label, points = [], polygons = [], riskCells = [], selectedId = null, onSelect, onMapClick, bounds, center = [84.5, 21], zoom = 6, className = 'h-[60vh] min-h-80', children, basemapStyle: externalBasemapStyle, imageOverlay = null, lines, onMapReady, onMapDoubleClick, doubleClickZoom = true }: MapViewProps) {
  console.log('[DEBUG MapView] Received props:', { pointsCount: points.length, polygonsCount: polygons.length, riskCellsCount: riskCells.length });
  const { t } = useTranslation();
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const colorsRef = useRef<MapColors | null>(null);
  const handlers = useRef({ onSelect, onMapClick, onMapDoubleClick, onMapReady });
  handlers.current = { onSelect, onMapClick, onMapDoubleClick, onMapReady };
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const pointData = useMemo(() => pointsToGeoJson(points), [points]);
  const polygonData = useMemo(() => polygonsToGeoJson(polygons), [polygons]);
  const riskData = useMemo(() => {
    const data = riskCellsToGeoJson(riskCells);
    console.log('[DEBUG MapView] Risk GeoJSON created:', data.features.length, 'features');
    return data;
  }, [riskCells]);

  useEffect(() => {
    if (!host.current) return;
    ensureProtocol();
    let colors = readMapColors(); colorsRef.current = colors;
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let map: MapLibreMap;
    try {
      const initialStyle = externalBasemapStyle ?? basemapStyle(colors, isDark());
      map = new maplibregl.Map({ container: host.current, style: initialStyle as StyleSpecification, center, zoom, attributionControl: { compact: true }, cancelPendingTileRequestsWhileZooming: true, fadeDuration: reduceMotion ? 0 : 150, canvasContextAttributes: { preserveDrawingBuffer: true } });
    } catch { setFailed(true); return; }
    mapRef.current = map;
    
    // DEBUG: Expose map globally for console debugging
    if (typeof window !== 'undefined') {
      (window as any).__twMap = map;
      console.log('Map instance exposed as window.__twMap');
    }
    
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');
    (map as unknown as { setMissingStyleImageResolver(resolver: (id: string) => void): void }).setMissingStyleImageResolver(id => { if (!map.hasImage(id)) map.addImage(id, drawSymbol(id as SymbolKind, colorsRef.current ?? colors), { pixelRatio: SYMBOL_PIXEL_RATIO }); });
    
    // Install sources and layers - use 'style.load' which is more reliable than 'load'
    const setupMap = () => {
      console.log('[DEBUG install] Map setup triggered');
      install(map, colors); 
      console.log('[DEBUG install] Install complete, setting ready to true');
      setReady(true); 
      console.log('[DEBUG install] Map load complete, ready set to true');
    };
    
    // Try both events - whichever fires first
    let setupCompleted = false;
    const safeSetup = () => {
      if (setupCompleted) return;
      setupCompleted = true;
      setupMap();
    };
    map.once('load', safeSetup);
    map.once('style.load', safeSetup);
    
    // Fallback: if neither fires within 1 second, do it anyway
    setTimeout(() => {
      if (!setupCompleted && map.isStyleLoaded()) {
        console.log('[DEBUG install] Fallback setup triggered');
        safeSetup();
      }
    }, 1000);
    map.on('error', (event: { error?: { message?: string } }) => { if (/pmtiles|resq-basemap|Failed to fetch/i.test(String(event.error?.message))) setFailed(true); });
    map.on('click', (event: ClickEvent) => {
      const hit = map.getLayer(POINTS) ? map.queryRenderedFeatures(event.point, { layers: [POINTS] })[0] : undefined;
      if (hit) handlers.current.onSelect?.(String(hit.properties?.id)); else { handlers.current.onSelect?.(null); handlers.current.onMapClick?.(event.lngLat.lat, event.lngLat.lng); }
    });
    map.on('dblclick', (event: ClickEvent) => { handlers.current.onMapDoubleClick?.(event.lngLat.lat, event.lngLat.lng); });
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
  useEffect(() => { 
    const map = mapRef.current; 
    if (ready && map) {
      const source = map.getSource(RISK) as unknown as DataSource | undefined;
      if (source) {
        console.log('[DEBUG MapView] Setting risk data directly:', riskData.features.length, 'features');
        source.setData(riskData);
      }
    }
  }, [ready, riskData]);
  const lineData = useMemo(() => ({ type: 'FeatureCollection', features: (lines ?? []).filter(l => l.coords.length >= 2).map(l => ({ type: 'Feature', id: l.id, properties: { id: l.id, tone: l.tone }, geometry: { type: 'LineString', coordinates: l.coords } })) }), [lines]);
  useEffect(() => { const map = mapRef.current; if (ready && map) (map.getSource(LINES) as unknown as DataSource | undefined)?.setData(lineData); }, [ready, lineData]);
  useEffect(() => { const map = mapRef.current; if (ready && map) handlers.current.onMapReady?.(map); }, [ready]);
  useEffect(() => { const map = mapRef.current; if (!map) return; if (doubleClickZoom) map.doubleClickZoom.enable(); else map.doubleClickZoom.disable(); }, [ready, doubleClickZoom]);
  useEffect(() => {
    const map = mapRef.current; if (!ready || !map) return;
    const existing = map.getSource(IMAGE) as unknown as { updateImage(o: { url: string; coordinates: Quad }): void } | undefined;
    if (!imageOverlay) { if (map.getLayer(IMAGE)) map.removeLayer(IMAGE); if (existing) map.removeSource(IMAGE); return; }
    if (existing) { existing.updateImage({ url: imageOverlay.url, coordinates: imageOverlay.coordinates }); return; }
    map.addSource(IMAGE, { type: 'image', url: imageOverlay.url, coordinates: imageOverlay.coordinates });
    map.addLayer({ id: IMAGE, type: 'raster', source: IMAGE, paint: { 'raster-opacity': imageOverlay.opacity ?? 1, 'raster-fade-duration': 0 } }, map.getLayer(`${POLY}-cell-fill`) ? `${POLY}-cell-fill` : undefined);
  }, [ready, imageOverlay]);
  useEffect(() => { const map = mapRef.current; if (ready && map?.getLayer(POINTS_SEL)) map.setFilter(POINTS_SEL, ['==', ['get', 'id'], selectedId ?? '__none__']); }, [ready, selectedId]);
  useEffect(() => {
    const map = mapRef.current; const colors = colorsRef.current;
    if (!ready || !map || !externalBasemapStyle || !colors) return;
    
    console.log('[DEBUG Basemap Effect] Changing basemap style');
    map.setStyle(externalBasemapStyle as StyleSpecification);
    map.once('style.load', () => { 
      console.log('[DEBUG Basemap Effect] Style loaded, reinstalling sources');
      install(map, colors); 
      setReady(false); 
      setReady(true); 
    });
  }, [ready, externalBasemapStyle]);
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
