import { useCallback, useEffect, useRef, useState } from 'react';
import Map, { MapRef, NavigationControl } from 'react-map-gl/maplibre';
import { API } from '../app/config';
import { MapControls } from '../components/MapControls';
import { PriorityList } from '../components/PriorityList';
import { RiskLayer } from '../components/RiskLayer';
import { RiskLegend } from '../components/RiskLegend';
import { CellPanel } from '../components/CellPanel';
import { SimulationCanvas } from '../components/SimulationCanvas';
import { DEFAULT_CENTER, gridBounds } from '../lib/simulationGeometry';
import { ErrorState, LoadingState } from '../components/AsyncState';

export type RiskRecord = { cell_id: number; state: string; rank_percentile: number; band: string; top_drivers: string[]; latitude?: number; longitude?: number };
type RiskResponse = { forest_cell_count: number; model: string; records: RiskRecord[]; coverage?: string; coverage_complete?: boolean };

const mapStyle = { version: 8 as const, sources: { osm: { type: 'raster' as const, tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }] };

export function MapPage() {
  const mapRef = useRef<MapRef | null>(null);
  const params = new URLSearchParams(location.search);
  const [ready, setReady] = useState(false);
  const [targetDate, setTargetDate] = useState(params.get('d') || '2024-06-18');
  const [risk, setRisk] = useState<RiskResponse | null>(null);
  const [riskLoading, setRiskLoading] = useState(true);
  const [riskError, setRiskError] = useState('');
  const [riskGeometryReady, setRiskGeometryReady] = useState(false);
  const [limit, setLimit] = useState(Number(params.get('k') || 50));
  const [showList, setShowList] = useState(params.get('view') === 'priority');
  const [layers, setLayers] = useState<Record<string, boolean>>({ panel: false, risk: true, simulation: false, detections: false, incidents: false, boundaries: false, roads: false, villages: false });
  const [basemap, setBasemap] = useState('Map');
  const [selected, setSelected] = useState<RiskRecord | null>(null);
  const [simulationOrigin] = useState(DEFAULT_CENTER);
  const [simulationHour, setSimulationHour] = useState(0);
  const [simulationDone, setSimulationDone] = useState(false);
  const handleSimulationComplete = useCallback(() => setSimulationDone(true), []);
  const handleRiskGeometryLoaded = useCallback(() => setRiskGeometryReady(true), []);

  useEffect(() => {
    const next = new URL(location.href);
    next.searchParams.set('d', targetDate); next.searchParams.set('k', String(limit));
    if (showList) next.searchParams.set('view', 'priority'); else next.searchParams.delete('view');
    history.replaceState({}, '', next);
  }, [targetDate, limit, showList]);

  useEffect(() => {
    const controller = new AbortController();
    setRiskGeometryReady(false);
    setRiskLoading(true); setRiskError('');
    setSelected(null);
    fetch(`${API}/api/risk/daily?target=${targetDate}`, { signal: controller.signal })
      .then(response => response.ok ? response.json() : Promise.reject())
      .then(setRisk)
      .catch(() => {
        if (!controller.signal.aborted) {
          setRisk(null);
          setRiskError('Historical fire-risk information could not be retrieved. Please try again later.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setRiskLoading(false); });
    return () => controller.abort();
  }, [targetDate]);

  useEffect(() => {
    // Fit the 1.2 km domain itself; a fixed zoom 12 would show it about 34 px wide.
    if (layers.simulation && ready) mapRef.current?.getMap().fitBounds(gridBounds(simulationOrigin), { padding: 80, duration: 0 });
  }, [layers.simulation, ready, simulationOrigin]);

  function selectRiskPoint(event: any) {
    let feature = event.features?.[0];
    if (!feature && event.point) {
      const map = mapRef.current?.getMap();
      const hits = map?.queryRenderedFeatures(
        [[event.point.x - 16, event.point.y - 16], [event.point.x + 16, event.point.y + 16]],
        { layers: ['risk-cells-points', 'risk-cells-fill'].filter(id => map?.getLayer(id)) }
      );
      if (hits && hits.length > 0) feature = hits[0];
    }
    if (!feature) return;
    const coordinates = feature.geometry?.type === 'Point'
      ? feature.geometry.coordinates
      : feature.geometry?.coordinates?.[0]?.[0];
    if (!coordinates) return;
    const props = feature.properties ?? {};
    // cell_id must be a valid number — ignore clicks on non-risk features
    if (typeof props.cell_id !== 'number' && typeof props.cell_id !== 'string') return;
    const cellId = Number(props.cell_id);
    if (!Number.isSafeInteger(cellId) || cellId <= 0) return;
    const lat = Number(coordinates[1]);
    const lon = Number(coordinates[0]);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    setSelected({ ...props, cell_id: cellId, latitude: lat, longitude: lon, top_drivers: [] });
    setShowList(true);
    // Pan to selected feature so the yellow ring stays in view
    mapRef.current?.getMap().flyTo({ center: [lon, lat], speed: 0.8, essential: true });
  }

  function selectPriorityRecord(record: RiskRecord) {
    setSelected(record);
    const map = mapRef.current?.getMap();
    const sourceFeatures = (map?.querySourceFeatures('risk-cells') ?? []) as GeoJSON.Feature[];
    const feature = sourceFeatures.find(item => Number(item.properties?.cell_id) === record.cell_id);
    if (feature?.geometry) {
      const coordinates: number[][] = [];
      const collect = (value: unknown) => {
        if (!Array.isArray(value)) return;
        if (typeof value[0] === 'number' && typeof value[1] === 'number') {
          coordinates.push([value[0], value[1]]);
          return;
        }
        value.forEach(collect);
      };
      if (feature.geometry.type === 'GeometryCollection') {
        feature.geometry.geometries.forEach((geometry: GeoJSON.Geometry) => {
          if (geometry.type !== 'GeometryCollection') collect(geometry.coordinates);
        });
      } else {
        collect(feature.geometry.coordinates);
      }
      if (coordinates.length) {
        const longitudes = coordinates.map(([longitude]) => longitude);
        const latitudes = coordinates.map(([, latitude]) => latitude);
        map?.flyTo({
          center: [(Math.min(...longitudes) + Math.max(...longitudes)) / 2, (Math.min(...latitudes) + Math.max(...latitudes)) / 2],
          speed: 0.8,
          essential: true,
        });
      }
    } else if (Number.isFinite(record.longitude) && Number.isFinite(record.latitude)) {
      map?.flyTo({ center: [record.longitude!, record.latitude!], speed: 0.8, essential: true });
    }
  }

  function showSavedExample() {
    setSimulationHour(0);
    setSimulationDone(false);
    setLayers(current => ({ ...current, simulation: !current.simulation }));
  }

  return <div className="map-wrap" data-testid="legacy-map-workspace" data-selected-cell-id={selected?.cell_id ?? ''} data-risk-geometry-ready={riskGeometryReady}>
    <Map ref={mapRef} onLoad={() => setReady(true)} onClick={selectRiskPoint} initialViewState={{ longitude: 80.2, latitude: 21.5, zoom: 4.7 }} mapStyle={mapStyle} aria-label="Risk map">
      <NavigationControl position="top-right" />
      <RiskLayer mapRef={mapRef} ready={ready} targetDate={targetDate} visible={layers.risk} selectedCellId={selected?.cell_id ?? null} onGeometryLoaded={handleRiskGeometryLoaded} />
      {layers.simulation && <SimulationCanvas mapRef={mapRef} ready={ready} frame={0} origin={simulationOrigin} onStep={setSimulationHour} onComplete={handleSimulationComplete} />}
    </Map>
    <MapControls showList={showList} setShowList={setShowList} limit={limit} setLimit={setLimit} layers={layers} setLayers={setLayers} basemap={basemap} setBasemap={setBasemap} />
    <section className="map-panel">
      <span className="eyebrow">Saved historical information</span>
      <label className="date-picker">Information date<input aria-label="Information date" type="date" min="2023-01-01" max="2024-12-31" value={targetDate} onChange={event => setTargetDate(event.target.value)} /></label>
      <h1>Historical fire-risk ranking</h1><p className="muted">Areas are ranked against one another for the selected date. This is not a current forecast, calibrated chance of fire, or prediction of how fire may spread.</p>
      {layers.simulation && <div className="empty simulation-notice">Saved example of possible fire spread over 48 hours from a fixed starting point. It is not an observed fire or a forecast. Vegetation assumptions are simplified, and the same January 2024 wind record is repeated throughout; these results are not calibrated for operational use.</div>}
      {layers.simulation && <div className="simulation-timeline"><strong>Example time: hour {simulationHour} of 48</strong><progress value={simulationHour} max={48} /><span className="muted">{simulationDone ? 'End of the saved example.' : 'Showing the example over time.'}</span></div>}
      <RiskLegend />
      <label className="priority-control">Areas to show: top {limit}<input type="range" min="20" max="200" step="10" value={limit} onChange={event => setLimit(Number(event.target.value))} /></label>
      {riskLoading && <LoadingState label="Loading the risk map…" />}
      {!riskLoading && riskError && <ErrorState message={riskError} />}
      {!riskLoading && !riskError && (risk?.forest_cell_count ? <><p className="cell-count">Areas included: {risk.forest_cell_count.toLocaleString()}</p>{!risk.coverage_complete && <div className="empty">This saved example covers only part of the forest area and must not be used as a complete patrol ranking.</div>}</> : <div className="empty">No historical information is available for this date. Choose another date.</div>)}
      <button className="primary-link" onClick={showSavedExample}>{layers.simulation ? 'Hide saved spread example' : 'Show saved example of possible fire spread'}</button>
      <p className="model-note">This saved example uses a fixed starting point near Similipal. It is not an observed event and is separate from the area ranking above.</p>
      <details className="model-note"><summary>Historical source information</summary><p>The spread example repeats a January 2024 Global Forecast System wind record. This does not represent the weather of the selected event.</p></details>
    </section>
    {showList && <aside className="priority-sheet"><button className="close-sheet" onClick={() => setShowList(false)}>Close</button><PriorityList records={risk?.records || []} limit={limit} selectedCellId={selected?.cell_id ?? null} onSelect={selectPriorityRecord} /></aside>}
    {selected && <CellPanel record={selected} count={risk?.forest_cell_count || 0} close={() => setSelected(null)} />}
  </div>;
}
