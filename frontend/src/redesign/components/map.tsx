import { useMemo, type ReactNode } from 'react';
import Map, { Source, Layer, Marker, NavigationControl, AttributionControl } from 'react-map-gl/maplibre';
import type { StyleSpecification } from 'maplibre-gl';
import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';
import { layers as basemapLayers, namedFlavor } from '@protomaps/basemaps';
import 'maplibre-gl/dist/maplibre-gl.css';

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

function useBasemapStyle(): StyleSpecification {
  return useMemo(
    () => ({
      version: 8,
      glyphs: 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf',
      sprite: 'https://protomaps.github.io/basemaps-assets/sprites/v4/light',
      sources: {
        [BASEMAP_SOURCE_ID]: {
          type: 'vector',
          url: `pmtiles://${BASEMAP_URL}`,
          attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, © <a href="https://protomaps.com">Protomaps</a>',
        },
      },
      layers: basemapLayers(BASEMAP_SOURCE_ID, namedFlavor('light'), { lang: 'en' }) as StyleSpecification['layers'],
    }),
    [],
  );
}

export type MapBounds = [west: number, south: number, east: number, north: number];

interface MapShellProps {
  label: string;
  children?: ReactNode;
  /** [lon, lat] center used when no bounds are given (state/regional overview screens). */
  center?: [number, number];
  zoom?: number;
  /** Fit the view to this box (used by incident-scoped screens: Incident, Replay). */
  bounds?: MapBounds;
  /** Height class; defaults to a square aspect so the map reads consistently across screens. */
  aspect?: 'square' | 'wide';
}

const INDIA_CENTER: [number, number] = [80.4, 20.3];

/** MapShell — the shared, real georeferenced map. Every screen that renders this gets an
 *  actual pannable/zoomable MapLibre view over the self-hosted PMTiles basemap; layer data
 *  (risk cells, detections, probability bands, baselines, wind arrows) is passed as children
 *  (Source/Layer/Marker). */
export function MapShell({ label, children, center, zoom, bounds, aspect = 'square' }: MapShellProps) {
  const style = useBasemapStyle();
  const initialViewState = bounds
    ? { bounds, fitBoundsOptions: { padding: 24 } }
    : { longitude: (center ?? INDIA_CENTER)[0], latitude: (center ?? INDIA_CENTER)[1], zoom: zoom ?? (center ? 10 : 4.6) };

  return (
    <div
      role="group"
      aria-label={label}
      className={`relative w-full overflow-hidden rounded-rq border border-contour bg-paper ${aspect === 'square' ? 'aspect-square' : 'aspect-[16/9]'}`}
    >
      <Map
        key={bounds ? bounds.join(',') : `${center?.join(',')}-${zoom}`}
        initialViewState={initialViewState}
        mapStyle={style}
        style={{ width: '100%', height: '100%' }}
        attributionControl={false}
        aria-label={label}
      >
        <AttributionControl compact position="bottom-right" />
        <NavigationControl position="top-right" showCompass={false} />
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

const RISK_COLOR_EXPR: maplibregl.DataDrivenPropertyValueSpecification<string> = [
  'match',
  ['get', 'band'],
  'Very high', '#b0183a',
  'High', '#e5701f',
  'Moderate', '#e9b824',
  'Low', '#bfd8cf',
  '#bfd8cf',
];

/** Risk cells (Today) — real GeoJSON from /api/risk/geojson, colour-ramped by band. */
export function RiskCellsLayer({ data, visible }: { data: GeoJSON.FeatureCollection; visible: boolean }) {
  return (
    <Source id="risk-cells" type="geojson" data={data}>
      <Layer
        id="risk-cells-fill"
        type="circle"
        layout={{ visibility: visible ? 'visible' : 'none' }}
        paint={{
          'circle-radius': 5,
          'circle-color': RISK_COLOR_EXPR,
          'circle-opacity': 0.85,
          'circle-stroke-width': 1,
          'circle-stroke-color': '#1d2a27',
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
export function DetectionsLayer({ detections, visible }: { detections: MapDetection[]; visible: boolean }) {
  if (!visible) return null;
  return (
    <>
      {detections.map((d) => (
        <Marker key={d.id} longitude={d.lon} latitude={d.lat} anchor="center">
          <div
            role="img"
            aria-label={`${d.label} — ${d.status === 'verify' ? 'verified' : d.status === 'dismiss' ? 'dismissed' : 'not yet verified'}`}
            title={d.label}
            className="h-4 w-4 rounded-full border-2"
            style={{ borderColor: '#6b2fa0', background: d.status === 'verify' ? '#6b2fa0' : 'transparent' }}
          />
        </Marker>
      ))}
    </>
  );
}

const PROB_COLOR_EXPR: maplibregl.DataDrivenPropertyValueSpecification<string> = [
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
  return (
    <Source id="probability-bands" type="geojson" data={data}>
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
  return (
    <Source id="observed-footprint" type="geojson" data={data}>
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
  return (
    <Source id={`baseline-${id}`} type="geojson" data={data}>
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
  return (
    <>
      {arrows.map((arrow, i) => (
        <Marker key={i} longitude={arrow.lon} latitude={arrow.lat} anchor="center" rotation={arrow.direction_deg}>
          <div
            role="img"
            aria-label={`Wind ${arrow.speed_ms.toFixed(1)} m/s toward ${arrow.direction_deg.toFixed(0)}°`}
            style={{
              width: 0,
              height: 0,
              borderLeft: '4px solid transparent',
              borderRight: '4px solid transparent',
              borderBottom: `${8 + Math.min(arrow.speed_ms * 3, 14)}px solid #1f6fb2`,
            }}
          />
        </Marker>
      ))}
    </>
  );
}

/** Ignition marker — the nominal (un-jittered) ignition point used by both baselines. */
export function IgnitionMarker({ lat, lon }: { lat: number; lon: number }) {
  return (
    <Marker longitude={lon} latitude={lat} anchor="center">
      <div role="img" aria-label="Nominal ignition point" className="h-3 w-3 rounded-full border-2 border-ink bg-danger" />
    </Marker>
  );
}
