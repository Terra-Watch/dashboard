type MapControlsProps={showList:boolean;setShowList:(value:boolean)=>void;limit:number;setLimit:(value:number)=>void;layers:Record<string,boolean>;setLayers:(value:Record<string,boolean>)=>void;basemap:string;setBasemap:(value:string)=>void};
const LAYERS: { id: string; label: string; available: boolean }[] = [
  { id: 'risk', label: 'Fire-risk areas', available: true },
  { id: 'detections', label: 'Satellite observations', available: false },
  { id: 'incidents', label: 'Incidents', available: false },
  { id: 'boundaries', label: 'State boundaries', available: false },
  { id: 'roads', label: 'Roads', available: false },
  { id: 'villages', label: 'Settlements', available: false },
];

export function MapControls({showList,setShowList,limit,setLimit,layers,setLayers,basemap,setBasemap}:MapControlsProps){return <div className="map-control-stack"><button className="icon-button" aria-label="Map layers" onClick={()=>setLayers({...layers,panel:!layers.panel})}>☷</button><button className="icon-button" aria-label="My location is not available in this example" title="Location is not available in this example" disabled>⊙</button><button className="icon-button" aria-label="Areas to monitor" onClick={()=>setShowList(!showList)}>≡</button>{layers.panel&&<section className="layer-menu" aria-label="Map layers"><strong>Show on map</strong><label><input type="checkbox" checked={layers.simulation} onChange={event=>setLayers({...layers,simulation:event.target.checked})}/>Explore example fire spread<small>Saved example</small></label>{LAYERS.map(layer=><label key={layer.id}><input type="checkbox" disabled={!layer.available} checked={layers[layer.id]} onChange={event=>setLayers({...layers,[layer.id]:event.target.checked})}/>{layer.label}{!layer.available&&<small>Not available in this example</small>}</label>)}<label>Map background<select value={basemap} onChange={event=>setBasemap(event.target.value)}><option>Map</option><option disabled>Satellite imagery — not available</option><option disabled>Terrain — not available</option></select></label><button onClick={()=>setShowList(true)}>Show areas to monitor</button></section>}</div>}
