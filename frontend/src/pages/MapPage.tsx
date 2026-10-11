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
import { api } from '../lib/api';
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
  const [limit, setLimit] = useState(Number(params.get('k') || 50));
  const [showList, setShowList] = useState(params.get('view') === 'priority');
  const [layers, setLayers] = useState<Record<string, boolean>>({ panel: false, risk: true, simulation: false, detections: false, incidents: false, boundaries: false, roads: false, villages: false });
  const [basemap, setBasemap] = useState('Map');
  const [selected, setSelected] = useState<RiskRecord | null>(null);
  const [simulationMessage, setSimulationMessage] = useState('');
  const [simulationRunning, setSimulationRunning] = useState(false);
  const [simulationOrigin, setSimulationOrigin] = useState(DEFAULT_CENTER);
  const [simulationHour, setSimulationHour] = useState(0);
  const [simulationDone, setSimulationDone] = useState(false);
  const handleSimulationComplete = useCallback(() => setSimulationDone(true), []);

  useEffect(() => {
    const next = new URL(location.href);
    next.searchParams.set('d', targetDate); next.searchParams.set('k', String(limit));
    if (showList) next.searchParams.set('view', 'priority'); else next.searchParams.delete('view');
    history.replaceState({}, '', next);
    setRiskLoading(true); setRiskError('');
    fetch(`${API}/api/risk/daily?target=${targetDate}`).then(response => response.ok ? response.json() : Promise.reject(new Error('The forecast could not be loaded.'))).then(setRisk).catch(reason => { setRisk(null); setRiskError(reason instanceof Error ? reason.message : 'The forecast could not be loaded.'); }).finally(() => setRiskLoading(false));
  }, [targetDate, limit, showList]);

  useEffect(() => {
    // Fit the 1.2 km domain itself; a fixed zoom 12 would show it about 34 px wide.
    if (layers.simulation && ready) mapRef.current?.getMap().fitBounds(gridBounds(simulationOrigin), { padding: 80, duration: 0 });
  }, [layers.simulation, ready, simulationOrigin]);

  function selectRiskPoint(event: any) {
    const feature = event.features?.[0];
    if (!feature) return;
    const coordinates = feature.geometry?.type === 'Point' ? feature.geometry.coordinates : feature.geometry?.coordinates?.[0]?.[0];
    if (!coordinates) return;
    setSelected({ ...feature.properties, latitude: Number(coordinates[1]), longitude: Number(coordinates[0]), top_drivers: [] });
  }

  async function runSimulationAt(latitude: number, longitude: number) {
    setSimulationRunning(true); setSimulationMessage('Running the simulated-spread demo…');
    try {
      const result = await api<{ status: string; message: string; domain?: { center: { latitude: number; longitude: number } } }>('/api/spread/jobs', { method: 'POST', body: JSON.stringify({ latitude, longitude, duration_hours: 48 }) });
      if (result.status !== 'development_demo') { setSimulationMessage(result.message); return; }
      // The raster is placed on the domain it was computed for, not on the clicked point.
      setSimulationOrigin(result.domain?.center ?? DEFAULT_CENTER); setSimulationHour(0); setSimulationDone(false); setLayers({ ...layers, simulation: true }); setSimulationMessage('Simulated spread completed from the fixed demo start. The canvas is replaying one step per hour with a fixed wind profile.');
    } catch (error) { setSimulationMessage(error instanceof Error ? error.message : 'Simulation could not be started.'); }
    finally { setSimulationRunning(false); }
  }

  return <div className="map-wrap">
    <Map ref={mapRef} onLoad={() => setReady(true)} onClick={selectRiskPoint} interactiveLayerIds={['risk-cells-points', 'risk-cells-fill']} initialViewState={{ longitude: 80.2, latitude: 21.5, zoom: 4.7 }} mapStyle={mapStyle} aria-label="Risk map">
      <NavigationControl position="top-right" />
      <RiskLayer mapRef={mapRef} ready={ready} targetDate={targetDate} visible={layers.risk} />
      {layers.simulation && <SimulationCanvas mapRef={mapRef} ready={ready} frame={0} origin={simulationOrigin} onStep={setSimulationHour} onComplete={handleSimulationComplete} />}
    </Map>
    <MapControls showList={showList} setShowList={setShowList} limit={limit} setLimit={setLimit} layers={layers} setLayers={setLayers} basemap={basemap} setBasemap={setBasemap} />
    <section className="map-panel">
      <span className="eyebrow">Sample data from a past date</span>
      <label className="date-picker">Forecast date<input type="date" min="2023-01-01" max="2024-12-31" value={targetDate} onChange={event => setTargetDate(event.target.value)} /></label>
      <h1>Fire-occurrence risk outlook</h1><p className="muted">Bands compare available records with each other on the same day. They rank where a fire is more likely to occur; they do not describe how a fire would spread.</p>
      {layers.simulation && <div className="empty simulation-notice">Simulated spread (48 h) is shown for a fixed demo start. It uses uncalibrated fuel proxies and a fixed wind profile (one January 2024 GFS 12-hour profile, repeated), not this forecast.</div>}
      {layers.simulation && <div className="simulation-timeline"><strong>Simulation time: hour {simulationHour} / 48</strong><progress value={simulationHour} max={48} /><span className="muted">{simulationDone ? 'Final 48-hour footprint shown.' : 'Advancing one model step per hour.'}</span></div>}
      <RiskLegend />
      <label className="priority-control">Plan for your teams: top {limit}<input type="range" min="20" max="200" step="10" value={limit} onChange={event => setLimit(Number(event.target.value))} /></label>
      {riskLoading && <LoadingState label="Loading the risk map…" />}
      {!riskLoading && riskError && <ErrorState message={riskError} />}
      {!riskLoading && !riskError && (risk?.forest_cell_count ? <><p className="cell-count">Available records: {risk.forest_cell_count.toLocaleString()}</p>{!risk.coverage_complete && <div className="empty">This is an archived validation subset, not a complete forest-grid forecast.</div>}</> : <div className="empty">No forecast for this date. Choose another date.</div>)}
      <button className="primary-link" disabled={simulationRunning} onClick={() => void runSimulationAt(21.867894, 86.500688)}>{simulationRunning ? 'Running simulation…' : 'Run simulated-spread demo (fixed Similipal start)'}</button>
      <p className="model-note">The simulator starts from a verified burned location, not from a risk cell, and is separate from the archived risk replay.</p>
      <p className="model-note">{risk?.model ? `Source: ${risk.model}` : 'Forecast data is unavailable.'}</p>
    </section>
    {showList && <aside className="priority-sheet"><button className="close-sheet" onClick={() => setShowList(false)}>Close</button><PriorityList records={risk?.records || []} limit={limit} onSelect={setSelected} /></aside>}
    {simulationMessage && <div className="map-toast" role="status">{simulationMessage}</div>}
    {selected && <CellPanel record={selected} count={risk?.forest_cell_count || 0} close={() => setSelected(null)} />}
  </div>;
}
