"use client";

import { useEffect, useRef, useState } from "react";
import { fetchBoats, fetchGateways, Boat, Gateway } from "../../lib/api";
import { Card } from "../ui/Card";
import { StatusBadge } from "../ui/StatusBadge";
import "leaflet/dist/leaflet.css";

// Viewport default only; never presented as a gateway or vessel position.
const DEFAULT_MAP_CENTER: [number, number] = [17.6868, 83.2185];

function formatAge(timestamp: string | null | undefined): string {
  if (!timestamp) return "Never";
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export function LiveMapWorkspace() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const boatMarkerRef = useRef<any>(null);
  const [boatCoords, setBoatCoords] = useState<[number, number] | null>(null);
  const [activeBoat, setActiveBoat] = useState<Boat | null>(null);
  const [gateway, setGateway] = useState<Gateway | null>(null);

  function updateBoatPosition(coords: [number, number]) {
    if (!mapInstanceRef.current || !LRef.current) return;
    if (boatMarkerRef.current) boatMarkerRef.current.setLatLng(coords);
    mapInstanceRef.current.flyTo(coords, 14, { duration: 1.5 });
  }

  useEffect(() => {
    let map: any = null;
    async function initMap() {
      if (!mapContainerRef.current || mapInstanceRef.current) return;
      const L = (await import("leaflet")).default;
      LRef.current = L;
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });
      map = L.map(mapContainerRef.current, { center: DEFAULT_MAP_CENTER, zoom: 10, zoomControl: true });
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      }).addTo(map);
      mapInstanceRef.current = map;
    }
    initMap();
    return () => {
      if (map) {
        map.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!boatCoords || boatMarkerRef.current || !mapInstanceRef.current || !LRef.current) return;
    const L = LRef.current;
    const boatIcon = L.divIcon({
      className: "custom-boat-marker",
      html: `<div style="background:#16a34a;color:white;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;border:3px solid white;box-shadow:0 0 20px rgba(22,163,74,0.8);">⛵</div>`,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });
    boatMarkerRef.current = L.marker(boatCoords, { icon: boatIcon }).addTo(mapInstanceRef.current);
  }, [boatCoords]);

  useEffect(() => {
    let mounted = true;
    async function loadData() {
      const [boatsData, gatewaysData] = await Promise.all([fetchBoats(), fetchGateways()]);
      if (!mounted) return;
      const boat = boatsData[0] ?? null;
      setActiveBoat(boat);
      setGateway(gatewaysData[0] ?? null);
      if (boat?.location?.latitude != null && boat.location.longitude != null) {
        const coords: [number, number] = [boat.location.latitude, boat.location.longitude];
        setBoatCoords(coords);
        updateBoatPosition(coords);
      } else {
        setBoatCoords(null);
        if (boatMarkerRef.current && mapInstanceRef.current) {
          boatMarkerRef.current.removeFrom(mapInstanceRef.current);
          boatMarkerRef.current = null;
        }
      }
    }
    loadData();
    const interval = setInterval(loadData, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const boatIsLive = activeBoat?.status === "ONLINE";
  const gatewayIsLive = gateway?.status === "ONLINE";
  const mapLabel = boatIsLive ? "LIVE" : activeBoat ? "STALE" : "NO LIVE DATA";
  const rfActive = boatIsLive && gatewayIsLive;
  const hasPosition = boatCoords !== null && Boolean(activeBoat?.lastSeen);

  return (
    <Card className="live-map-workspace" style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Maritime Map & Radar</h2>
          <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "4px 0 0 0" }}>Backend-reported vessel telemetry and last-known position</p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <StatusBadge label={mapLabel} tone={boatIsLive ? "healthy" : "neutral"} />
          <StatusBadge label={rfActive ? "RF LINK ACTIVE" : "RF LINK UNAVAILABLE"} tone={rfActive ? "healthy" : "neutral"} />
        </div>
      </div>

      <div ref={mapContainerRef} style={{ width: "100%", height: "480px", borderRadius: "10px", overflow: "hidden", border: "1px solid #cbd5e1", boxShadow: "inset 0 0 10px rgba(0,0,0,0.05)", zIndex: 1 }} />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginTop: "1.25rem", padding: "1rem", background: "rgba(241, 245, 249, 0.6)", borderRadius: "8px", border: "1px solid #e2e8f0", fontSize: "0.85rem" }}>
        <div>
          <span style={{ color: "#64748b", display: "block" }}>TRACKED VESSEL</span>
          <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>{activeBoat ? `${activeBoat.boatId} (Node #${activeBoat.nodeId})` : "No vessel data"}</strong>
          {activeBoat && <div>{activeBoat.status} · Last seen {formatAge(activeBoat.lastSeen)}</div>}
        </div>
        <div>
          <span style={{ color: "#64748b", display: "block" }}>{boatIsLive ? "CURRENT SIGNAL" : "LAST OBSERVED SIGNAL"}</span>
          <strong style={{ fontSize: "1.05rem", color: "#0284c7" }}>{activeBoat?.rssi != null ? `${activeBoat.rssi} dBm` : "Unavailable"} <span style={{ fontSize: "0.85rem", color: "#64748b" }}>(SNR: {activeBoat?.snr != null ? `${activeBoat.snr} dB` : "Unavailable"})</span></strong>
          {activeBoat && <div>Observed {formatAge(activeBoat.lastSeen)}</div>}
        </div>
        <div>
          <span style={{ color: "#64748b", display: "block" }}>TOTAL HEARTBEATS</span>
          <strong style={{ fontSize: "1.05rem", color: "#16a34a" }}>{activeBoat ? `${activeBoat.heartbeatCount} total` : "Unavailable"}</strong>
        </div>
        <div>
          <span style={{ color: "#64748b", display: "block" }}>{boatIsLive ? "CURRENT POSITION" : "LAST KNOWN POSITION"}</span>
          <strong style={{ fontSize: "1rem", color: "#334155" }}>{hasPosition && boatCoords ? `${boatCoords[0].toFixed(4)}° N, ${boatCoords[1].toFixed(4)}° E` : "Position unavailable"}</strong>
          {hasPosition && <div>{boatIsLive ? "Reported " : "Last reported "}{formatAge(activeBoat?.lastSeen)}</div>}
        </div>
      </div>
    </Card>
  );
}
