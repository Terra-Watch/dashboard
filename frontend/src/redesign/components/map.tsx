import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, ScaleControl, AttributionControl } from 'react-map-gl/maplibre';
import type { StyleSpecification, DataDrivenPropertyValueSpecification } from '@maplibre/maplibre-gl-style-spec';
import * as maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps';
import 'maplibre-gl/dist/maplibre-gl.css';

// MapLibre 6 no longer exposes a default export and its worker is not
// discovered reliably by Vite from the package's module URL. Bundle the
// official worker explicitly so maps can reach the idle state in production
// and in installed/offline-capable builds.
maplibregl.setWorkerUrl(new URL('maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url).toString());

/** Real georeferenced basemap: MapLibre GL + a Protomaps PMTiles extract (OSM-derived data,
 *  ODbL), self-hosted at /tiles/resq-basemap.pmtiles — never tile.openstreetmap.org (per Gate 1
 *  basemap amendment). Extracted via `go-pmtiles extract` for the six RESQ-scoped states
 *  (OD, CG, TS, MP, MH, JH) plus margin, zoom 0-10. See docs/redesign/07_maps.md. */
let protocolRegistered = false;
function ensurePmtilesProtocol() {
  if (protocolRegistered) return;
  const protocol = new Protocol();
  maplibregl.addProtocol('pmtiles', protocol.tile);
  protocolRegistered = true;
}
ensurePmtilesProtocol();

const BASEMAP_SOURCE_ID = 'protomaps';
const BASEMAP_URL = `${import.meta.env.BASE_URL ?? '/'}tiles/resq-basemap.pmtiles`.replace(/\/\//g, '/');

function useBasemapStyle(offline: boolean): StyleSpecification {
  return useMemo(
    () => {
      const layers = basemapLayers(BASEMAP_SOURCE_ID, namedFlavor('light'), { lang: 'en' }) as StyleSpecification['layers'];
      return {
        version: 8,
        ...(offline ? {} : {
          glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
          sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
        }),
        sources: {
          [BASEMAP_SOURCE_ID]: {
            type: 'vector',
            url: `pmtiles://${BASEMAP_URL}`,
            attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://protomaps.com">Protomaps</a>',
          },
        },
        // Symbol layers depend on remote glyph/sprite services. The offline demo keeps the
        // locally bundled PMTiles geometry and overlays, while omitting only those labels/icons.
        layers: offline ? layers.filter((layer) => layer.type !== 'symbol') : layers,
      };
    },
    [offline],
  );
}

import {
  isValidBounds,
  isValidCenter,
  toSafeGeoJson,
  EMPTY_GEOJSON,
  type MapBounds,
} from '../lib/geospatial';

export type { MapBounds };
export { isValidBounds, isValidCenter, toSafeGeoJson };

interface MapShellProps {
  label: string;
  children?: ReactNode;
  /** [lon, lat] center used when no bounds are given (state/regional overview screens). */
  center?: [number, number];
  zoom?: number;
  /** Fit the view to this box (used by incident-scoped screens: Incident, Replay). */
  bounds?: MapBounds;
  /** Removes remote glyph/sprite dependencies while retaining the locally bundled PMTiles. */
  offline?: boolean;
  /** Enables selection from the historical risk-cell layer when supplied. */
  onRiskCellSelect?: (cellId: number | null) => void;
  onMapClick?: (longitude: number, latitude: number) => void;
  /** Height class; defaults to a square aspect so the map reads consistently across screens. */
  aspect?: 'square' | 'wide';
}

const INDIA_CENTER: [number, number] = [80.4, 20.3];

/** MapShell — the shared, real georeferenced map. Every screen that renders this gets an
 *  actual pannable/zoomable MapLibre view over the self-hosted PMTiles basemap; layer data
 *  (risk cells, detections, probability bands, baselines, wind arrows) is passed as children
 *  (Source/Layer/Marker). */
export function MapShell({ label, children, center, zoom, bounds, aspect = 'square', offline = false, onRiskCellSelect, onMapClick }: MapShellProps) {
  const style = useBasemapStyle(offline);

  const safeBounds = isValidBounds(bounds) ? bounds : undefined;
  const safeCenter = isValidCenter(center) ? center : INDIA_CENTER;
  const safeZoom = typeof zoom === 'number' && Number.isFinite(zoom) ? zoom : (center ? 10 : 4.6);
  const mapKey = safeBounds ? safeBounds.join(',') : `${safeCenter.join(',')}-${safeZoom}`;
  const [mapState, setMapState] = useState<'loading' | 'ready' | 'error'>('loading');
  const styleLoaded = useRef(false);

  useEffect(() => {
    styleLoaded.current = false;
    setMapState('loading');
  }, [mapKey]);

  const initialViewState = safeBounds
    ? { bounds: safeBounds, fitBoundsOptions: { padding: 24 } }
    : { longitude: safeCenter[0], latitude: safeCenter[1], zoom: safeZoom };

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="map-shell"
      data-map-state={mapState}
      data-map-idle={mapState === 'ready'}
      className={`relative w-full overflow-hidden rounded-rq border border-contour bg-paper ${aspect === 'square' ? 'aspect-square' : 'aspect-[16/9]'}`}
    >
      <div
        role={mapState === 'error' ? 'alert' : 'status'}
        aria-live={mapState === 'error' ? 'assertive' : 'polite'}
        className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-sheet/95 px-2 py-1 text-xs text-ink shadow"
        data-testid="map-render-status"
      >
        {mapState === 'loading' && 'Loading map…'}
        {mapState === 'ready' && 'Map rendered and idle.'}
        {mapState === 'error' && 'Map tiles or style could not be rendered. Check your connection and try again.'}
      </div>
      <Map
        key={mapKey}
        initialViewState={initialViewState}
        mapStyle={style}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        locale={{ 'Map.Title': label }}
        aria-label={label}
        interactiveLayerIds={onRiskCellSelect ? ['risk-cells-fill', 'risk-cells-points'] : undefined}
        onClick={(event) => {
          if (onMapClick) onMapClick(event.lngLat.lng, event.lngLat.lat);
          if (!onRiskCellSelect) return;
          const features = (event.features ?? []) as Array<{ layer: { id: string }; properties?: Record<string, unknown> }>;
          const feature = features.find((item) => item.layer.id === 'risk-cells-fill' || item.layer.id === 'risk-cells-points');
          const rawId = feature?.properties?.cell_id;
          const cellId = typeof rawId === 'number' ? rawId : typeof rawId === 'string' && rawId.trim() ? Number(rawId) : NaN;
          onRiskCellSelect(Number.isSafeInteger(cellId) ? cellId : null);
        }}
        onLoad={() => {
          styleLoaded.current = true;
        }}
        onError={(event) => {
          const ev = event as unknown as { sourceId?: string; error?: { message?: string } };
          const sourceId = ev.sourceId;
          const msg = String(ev.error?.message || '').toLowerCase();
          if (sourceId === BASEMAP_SOURCE_ID || msg.includes('pmtiles') || msg.includes('resq-basemap')) {
            setMapState('error');
          }
        }}
        onIdle={() => {
          setMapState((current) => current === 'error' ? current : 'ready');
        }}
      >
        <AttributionControl compact position="bottom-right" />
        <ScaleControl maxWidth={120} unit="metric" position="bottom-left" />
        <NavigationControl position="top-right" showCompass />
        {children}
      </Map>
    </div>
  );
}

const DEFAULT_LAYERS = [
  { id: 'risk', label: 'Risk cells', available: true },
  { id: 'detections', label: 'Detections', available: true },
  { id: 'incidents', label: 'Incidents', available: true },
  { id: 'boundaries', label: 'Boundaries', available: false },
  { id: 'roads', label: 'Roads', available: false },
  { id: 'villages', label: 'Settlements', available: false },
] as const;

export interface LayerDef {
  id: string;
  label: string;
  available: boolean;
}

/** LayerPanel — which overlays a screen can toggle. `layers` is screen-specific: only mark a
 *  layer `available: true` once that screen actually fetches and renders its data (no toggle
 *  that does nothing). Falls back to the full documented set from 08_design_system.md when no
 *  `layers` prop is given (used by the styleguide). */
export function LayerPanel({ active, onToggle, layers = DEFAULT_LAYERS }: { active: Set<string>; onToggle: (id: string) => void; layers?: readonly LayerDef[] }) {
  return (
    <fieldset className="rounded-rq border border-contour bg-sheet p-3">
      <legend className="px-1 text-xs font-semibold text-ink-muted">Layers</legend>
      <ul className="space-y-1.5">
        {layers.map((layer) => (
          <li key={layer.id} className="flex items-center justify-between gap-2 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                disabled={!layer.available}
                checked={active.has(layer.id)}
                onChange={() => onToggle(layer.id)}
                className="h-4 w-4"
              />
              {layer.label}
            </label>
            {!layer.available && <span className="text-xs text-ink-muted">Unavailable</span>}
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** WindArrowsControl — toggles hourly wind-direction arrows on the active scenario map. */
export function WindArrowsControl({ visible, onChange }: { visible: boolean; onChange: (visible: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" checked={visible} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
      <span aria-hidden>↗</span> Show hourly wind arrows
    </label>
  );
}

// ---------- Reusable georeferenced overlay layers ----------

const RISK_COLOR_EXPR: DataDrivenPropertyValueSpecification<string> = [
  'match',
  ['get', 'band'],
  'Very high', '#b0183a',
  'High', '#e5701f',
  'Moderate', '#e9b824',
  'Low', '#bfd8cf',
  '#bfd8cf',
];

/** Risk cells (Today) — real GeoJSON from /api/risk/geojson, colour-ramped by band.
 *  Supports both Polygon geometries (from PostGIS c.geom) and Point geometries (from barv3 / cell centers). */
export function RiskCellsLayer({ data, visible, selectedCellId }: { data: GeoJSON.FeatureCollection; visible: boolean; selectedCellId?: number | null }) {
  const safeData = toSafeGeoJson(data);
  return (
    <Source id="risk-cells" type="geojson" data={safeData}>
      {/* Support for Polygon risk cell boundaries */}
      <Layer
        id="risk-cells-fill"
        type="fill"
        filter={['==', ['geometry-type'], 'Polygon']}
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{
          'fill-color': RISK_COLOR_EXPR,
          'fill-opacity': ['case', ['==', ['get', 'cell_id'], selectedCellId ?? -1], 0.9, 0.65],
          'fill-outline-color': selectedCellId == null ? '#ffffff' : ['case', ['==', ['get', 'cell_id'], selectedCellId], '#111827', '#ffffff'],
        }}
      />
      {/* Support for Point risk cell centroids */}
      <Layer
        id="risk-cells-points"
        type="circle"
        filter={['==', ['geometry-type'], 'Point']}
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{
          'circle-radius': 5,
          'circle-color': RISK_COLOR_EXPR,
          'circle-opacity': 0.85,
          'circle-stroke-width': selectedCellId == null ? 1 : ['case', ['==', ['get', 'cell_id'], selectedCellId], 3, 1],
          'circle-stroke-color': selectedCellId == null ? '#1d2a27' : ['case', ['==', ['get', 'cell_id'], selectedCellId], '#111827', '#1d2a27'],
        }}
      />
    </Source>
  );
}

export interface MapDetection {
  id: string;
  lat: number;
  lon: number;
  label: string;
  status: string;
}

/** Detection pins (Watch, Field, Incident-as-ignition-evidence) — violet rings per 07_maps.md. */
export function DetectionsLayer({
  detections,
  visible,
  selectedId,
  onSelect,
}: {
  detections: MapDetection[];
  visible: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  if (!visible) return null;
  const validDetections = (detections || []).filter(
    (d) => typeof d.lat === 'number' && typeof d.lon === 'number' && Number.isFinite(d.lat) && Number.isFinite(d.lon) && d.lat >= -90 && d.lat <= 90 && d.lon >= -180 && d.lon <= 180
  );
  return (
    <>
      {validDetections.map((d) => {
        const isSelected = selectedId === d.id;
        return (
          <Marker
            key={d.id}
            longitude={d.lon}
            latitude={d.lat}
            anchor="center"
            onClick={onSelect ? () => onSelect(d.id) : undefined}
          >
            <div
              role="img"
              aria-label={`${d.label} — ${d.status === 'verify' ? 'verified' : d.status === 'dismiss' ? 'dismissed' : 'not yet verified'}`}
              title={d.label}
              className={`rounded-full border-2 transition-transform ${onSelect ? 'cursor-pointer' : ''} ${isSelected ? 'h-5 w-5 ring-2 ring-canopy ring-offset-1 scale-125' : 'h-4 w-4'}`}
              style={{ borderColor: '#6b2fa0', background: d.status === 'verify' ? '#6b2fa0' : isSelected ? '#6b2fa033' : 'transparent' }}
            />
          </Marker>
        );
      })}
    </>
  );
}

const PROB_COLOR_EXPR: DataDrivenPropertyValueSpecification<string> = [
  'match',
  ['get', 'band'],
  0, '#d8e3ec',
  1, '#7fa8c9',
  2, '#3d6e97',
  3, '#16314a',
  '#d8e3ec',
];

/** Burn-probability bands (Incident scenario, Replay) — a real GeoJSON grid of 30m cells
 *  reprojected from the simulation's EPSG:32644 domain to WGS84 by the backend
 *  (`backend/app/services/redesign_data.py:probability_grid_geojson`). */
export function ProbabilityBandsLayer({ data, visible }: { data: GeoJSON.FeatureCollection; visible: boolean }) {
  const safeData = toSafeGeoJson(data);
  return (
    <Source id="probability-bands" type="geojson" data={safeData}>
      <Layer
        id="probability-bands-fill"
        type="fill"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'fill-color': PROB_COLOR_EXPR, 'fill-opacity': 0.75 }}
      />
    </Source>
  );
}

/** Observed VIIRS footprint (Replay only) — solid dark outline, no fill, distinct from the
 *  probability-band fill per 07_maps.md's render-order table. */
export function ObservedFootprintLayer({ data, visible }: { data: GeoJSON.FeatureCollection; visible: boolean }) {
  const safeData = toSafeGeoJson(data);
  return (
    <Source id="observed-footprint" type="geojson" data={safeData}>
      <Layer
        id="observed-footprint-line"
        type="line"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'line-color': '#1d2a27', 'line-width': 2 }}
      />
    </Source>
  );
}

/** Baseline outline(s) — proximity (dashed) always available; circle/final-area (dotted) on
 *  Replay only, per 07_maps.md. */
export function BaselineLayer({
  data,
  visible,
  id,
  dash,
}: {
  data: GeoJSON.FeatureCollection;
  visible: boolean;
  id: string;
  dash: [number, number];
}) {
  const safeData = toSafeGeoJson(data);
  return (
    <Source id={`baseline-${id}`} type="geojson" data={safeData}>
      <Layer
        id={`baseline-${id}-line`}
        type="line"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'line-color': '#1d2a27', 'line-width': 2, 'line-dasharray': dash }}
      />
    </Source>
  );
}

export interface WindArrow {
  lat: number;
  lon: number;
  direction_deg: number;
  speed_ms: number;
}

/** Wind arrows (Incident scenario, Replay) — info-blue, length by speed, per 07_maps.md. */
export function WindArrowsLayer({ arrows, visible }: { arrows: WindArrow[]; visible: boolean }) {
  if (!visible) return null;
  const validArrows = (arrows || []).filter(
    (a) =>
      typeof a.lat === 'number' &&
      typeof a.lon === 'number' &&
      Number.isFinite(a.lat) &&
      Number.isFinite(a.lon) &&
      a.lat >= -90 &&
      a.lat <= 90 &&
      a.lon >= -180 &&
      a.lon <= 180 &&
      typeof a.speed_ms === 'number' &&
      Number.isFinite(a.speed_ms) &&
      a.speed_ms >= 0 &&
      typeof a.direction_deg === 'number' &&
      Number.isFinite(a.direction_deg)
  );
  return (
    <>
      {validArrows.map((arrow, i) => {
        const normalizedDeg = ((arrow.direction_deg % 360) + 360) % 360;
        return (
          <Marker key={i} longitude={arrow.lon} latitude={arrow.lat} anchor="center" rotation={normalizedDeg}>
            <div
              role="img"
              aria-label={`Wind ${arrow.speed_ms.toFixed(1)} m/s toward ${normalizedDeg.toFixed(0)}°`}
              style={{
                width: 0,
                height: 0,
                borderLeft: '4px solid transparent',
                borderRight: '4px solid transparent',
                borderBottom: `${8 + Math.min(arrow.speed_ms * 3, 14)}px solid #1f6fb2`,
              }}
            />
          </Marker>
        );
      })}
    </>
  );
}

/** Ignition marker — the nominal (un-jittered) ignition point used by both baselines. */
export function IgnitionMarker({ lat, lon }: { lat: number; lon: number }) {
  if (
    typeof lat !== 'number' ||
    typeof lon !== 'number' ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lon) ||
    lat < -90 ||
    lat > 90 ||
    lon < -180 ||
    lon > 180
  ) {
    return null;
  }
  return (
    <Marker longitude={lon} latitude={lat} anchor="center">
      <div role="img" aria-label="Nominal ignition point" className="h-3 w-3 rounded-full border-2 border-ink bg-danger" />
    </Marker>
  );
}

/** OperationalMapLegend — distinguishes data types clearly per scientific protocol:
 *  satellite observations vs cumulative footprint vs risk index vs spread probability vs wind vectors. */
export function OperationalMapLegend() {
  return (
    <div aria-label="Operational map distinction guide" className="rounded-rq border border-contour bg-sheet p-3 text-xs text-ink-muted">
      <p className="font-semibold text-ink">Map Layer Distinctions</p>
      <ul className="mt-2 space-y-1.5">
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-3 rounded-full border-2 border-[#6b2fa0]" />
          <span><strong className="text-ink">Satellite detection:</strong> Radiometric observation point from satellite overpass; not an exact physical fire perimeter. Absence of detection does not indicate an area is unburned.</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-3 border-2 border-ink" />
          <span><strong className="text-ink">Observed footprint:</strong> Cumulative observed detection boundary (375 m pixel envelope); unobserved areas may still have burned.</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-risk-high" />
          <span><strong className="text-ink">Fire-risk rank:</strong> Relative index ranking forest areas against one another for a past date; not an ignition perimeter.</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm bg-prob-3" />
          <span><strong className="text-ink">Spread scenario:</strong> Saved ensemble simulation grid; not a live forecast or observed burned area.</span>
        </li>
        <li className="flex items-center gap-2">
          <span aria-hidden className="inline-block text-[#1f6fb2]">↗</span>
          <span><strong className="text-ink">Wind vector:</strong> Hourly direction (pointing toward) and speed from historical reanalysis.</span>
        </li>
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OSM vector overlay layers (RESQ7)
// Source: OpenStreetMap via Overpass API, ODbL 1.0 — © OpenStreetMap contributors
// PMTiles files: /tiles/current/osm-<layer>.pmtiles (built by scripts/convert_and_tile.py)
// These components render nothing when not visible or absent.
// ---------------------------------------------------------------------------

function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL ?? '/';
  return `${base.replace(/\/$/, '')}/${path.replace(/^\/+/, '')}`;
}

function osmTileUrl(layer: string): string {
  return `pmtiles://${assetUrl(`tiles/current/osm-${layer}.pmtiles`)}`;
}

/** OSM forest cover — natural=wood and landuse=forest polygons (green fill). */
export function OsmForestLayer({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Source id="osm-forest" type="vector" url={osmTileUrl('forest')} attribution="© OpenStreetMap contributors (ODbL)">
      <Layer
        id="osm-forest-fill"
        source-layer="osm_forest"
        type="fill"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'fill-color': '#2d6a4f', 'fill-opacity': 0.35 }}
      />
      <Layer
        id="osm-forest-outline"
        source-layer="osm_forest"
        type="line"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'line-color': '#1b4332', 'line-width': 0.5, 'line-opacity': 0.6 }}
      />
    </Source>
  );
}

/** OSM protected areas — boundary=protected_area polygons (amber outline). */
export function OsmProtectedLayer({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Source id="osm-protected" type="vector" url={osmTileUrl('protected')} attribution="© OpenStreetMap contributors (ODbL)">
      <Layer
        id="osm-protected-fill"
        source-layer="osm_protected"
        type="fill"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'fill-color': '#b45309', 'fill-opacity': 0.15 }}
      />
      <Layer
        id="osm-protected-outline"
        source-layer="osm_protected"
        type="line"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'line-color': '#b45309', 'line-width': 1.2, 'line-dasharray': [4, 2] }}
      />
    </Source>
  );
}

/** OSM roads — major highway classes (motorway/trunk/primary/secondary/tertiary). */
export function OsmRoadsLayer({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Source id="osm-roads" type="vector" url={osmTileUrl('roads')} attribution="© OpenStreetMap contributors (ODbL)">
      <Layer
        id="osm-roads-line"
        source-layer="osm_roads"
        type="line"
        layout={{ visibility: visible ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': [
            'match', ['get', 'highway'],
            'motorway', '#e85d04',
            'trunk', '#f48c06',
            'primary', '#ffd60a',
            'secondary', '#ced4da',
            '#adb5bd',
          ],
          'line-width': [
            'match', ['get', 'highway'],
            'motorway', 3,
            'trunk', 2.5,
            'primary', 2,
            'secondary', 1.5,
            'tertiary', 1.25,
            1,
          ],
          'line-opacity': 0.85,
        }}
      />
    </Source>
  );
}

/** OSM settlements — place=city/town/village points. */
export function OsmSettlementsLayer({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Source id="osm-settlements" type="vector" url={osmTileUrl('settlements')} attribution="© OpenStreetMap contributors (ODbL)">
      <Layer
        id="osm-settlements-circle"
        source-layer="osm_settlements"
        type="circle"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{
          'circle-radius': ['match', ['get', 'place'], 'city', 6, 'town', 4, 3],
          'circle-color': '#495057',
          'circle-stroke-width': 1,
          'circle-stroke-color': '#f8f9fa',
          'circle-opacity': 0.9,
        }}
      />
      <Layer
        id="osm-settlements-label"
        source-layer="osm_settlements"
        type="symbol"
        layout={{
          visibility: visible ? 'visible' : 'none',
          'text-field': ['coalesce', ['get', 'name'], ['get', 'name:en'], ''],
          'text-size': ['match', ['get', 'place'], 'city', 13, 'town', 11, 10],
          'text-offset': [0, 1.1],
          'text-allow-overlap': false,
        }}
        paint={{
          'text-color': '#343a40',
          'text-halo-color': '#f8f9fa',
          'text-halo-width': 1,
        }}
      />
    </Source>
  );
}

/** OSM water — waterway=river lines and natural=water polygons. */
export function OsmWaterLayer({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Source id="osm-water" type="vector" url={osmTileUrl('water')} attribution="© OpenStreetMap contributors (ODbL)">
      <Layer
        id="osm-water-fill"
        source-layer="osm_water"
        type="fill"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{ 'fill-color': '#1f6fb2', 'fill-opacity': 0.45 }}
        filter={['==', ['geometry-type'], 'Polygon']}
      />
      <Layer
        id="osm-water-line"
        source-layer="osm_water"
        type="line"
        layout={{ visibility: visible ? 'visible' : 'none', 'line-cap': 'round', 'line-join': 'round' }}
        paint={{ 'line-color': '#1f6fb2', 'line-width': 1.5, 'line-opacity': 0.8 }}
        filter={['==', ['geometry-type'], 'LineString']}
      />
    </Source>
  );
}

/** OSM administrative boundaries — boundary=administrative admin_level 2–8. */
export function OsmAdminLayer({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <Source id="osm-admin" type="vector" url={osmTileUrl('admin')} attribution="© OpenStreetMap contributors (ODbL)">
      <Layer
        id="osm-admin-line"
        source-layer="osm_admin"
        type="line"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{
          'line-color': '#6c757d',
          'line-width': ['match', ['to-string', ['get', 'admin_level']], '2', 2, '4', 1.5, 1],
          'line-dasharray': [3, 2],
          'line-opacity': 0.75,
        }}
      />
    </Source>
  );
}
