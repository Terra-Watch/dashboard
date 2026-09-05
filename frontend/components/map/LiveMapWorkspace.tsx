"use client";

import { useEffect, useRef, useState } from "react";
import { fetchBoats, Boat } from "../../lib/api";
import { Card } from "../ui/Card";
import { StatusBadge } from "../ui/StatusBadge";
import "leaflet/dist/leaflet.css";

const DEFAULT_GATEWAY: [number, number] = [17.6868, 83.2185];
const DEFAULT_BOAT: [number, number] = [17.6980, 83.2650];

export function LiveMapWorkspace() {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const gatewayMarkerRef = useRef<any>(null);
  const boatMarkerRef = useRef<any>(null);
  const coverageCircleRef = useRef<any>(null);
  const lineRef = useRef<any>(null);

  const [gatewayCoords, setGatewayCoords] = useState<[number, number]>(DEFAULT_GATEWAY);
  const [boatCoords, setBoatCoords] = useState<[number, number]>(DEFAULT_BOAT);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [activeBoat, setActiveBoat] = useState<Boat | null>(null);
  const [locationName, setLocationName] = useState<string>("Backend vessel location");

  function updateMapPositions(gCoords: [number, number], bCoords: [number, number]) {
    if (!mapInstanceRef.current || !LRef.current) return;
    const map = mapInstanceRef.current;

    if (gatewayMarkerRef.current) gatewayMarkerRef.current.setLatLng(gCoords);
    if (boatMarkerRef.current) boatMarkerRef.current.setLatLng(bCoords);
    if (coverageCircleRef.current) coverageCircleRef.current.setLatLng(gCoords);
    if (lineRef.current) lineRef.current.setLatLngs([gCoords, bCoords]);

    map.flyTo(bCoords, 12, { duration: 1.5 });
  }

  function requestCurrentLocation() {
    if (typeof window !== "undefined" && "geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          const newGateway: [number, number] = [lat, lng];

          setGatewayCoords(newGateway);
          setLocationName(`Current gateway location (${lat.toFixed(4)}°, ${lng.toFixed(4)}°)`);
          if (mapInstanceRef.current) {
            updateMapPositions(newGateway, boatCoords);
          }
        },
        () => {
          setLocationName("Coastline (default)");
        },
        { enableHighAccuracy: true, timeout: 8000 }
      );
    }
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

      map = L.map(mapContainerRef.current, {
        center: DEFAULT_GATEWAY,
        zoom: 12,
        zoomControl: true,
      });

      L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19,
      }).addTo(map);

      const gatewayIcon = L.divIcon({
        className: "custom-gateway-marker",
        html: `<div style="background:#0284c7;color:white;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:18px;border:3px solid white;box-shadow:0 0 15px rgba(2,132,199,0.7);">📡</div>`,
        iconSize: [38, 38],
        iconAnchor: [19, 19],
      });

      const gatewayMarker = L.marker(gatewayCoords, { icon: gatewayIcon }).addTo(map);
      gatewayMarker.bindPopup(`
        <div style="font-family:inherit;padding:4px;">
          <strong style="color:#0284c7;font-size:1.1em;">Shore Gateway</strong><br/>
          <span style="color:#64748b;font-size:0.85em;">LoRa shoreline connection</span>
        </div>
      `);

      const coverageCircle = L.circle(gatewayCoords, {
        radius: 5000,
        color: "#0284c7",
        fillColor: "#0284c7",
        fillOpacity: 0.12,
        weight: 1.5,
        dashArray: "6, 6",
      }).addTo(map);

      const boatIcon = L.divIcon({
        className: "custom-boat-marker",
        html: `<div style="background:#16a34a;color:white;width:40px;height:40px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:20px;border:3px solid white;box-shadow:0 0 20px rgba(22,163,74,0.8);">⛵</div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      });

      const boatMarker = L.marker(boatCoords, { icon: boatIcon }).addTo(map);
      boatMarker.bindPopup(`
        <div style="font-family:inherit;padding:4px;">
          <strong style="color:#64748b;font-size:1.1em;">Waiting for boat position</strong>
        </div>
      `);

      const linkLine = L.polyline([gatewayCoords, boatCoords], {
        color: "#0284c7",
        weight: 2.5,
        dashArray: "6, 8",
        opacity: 0.85,
      }).addTo(map);

      mapInstanceRef.current = map;
      gatewayMarkerRef.current = gatewayMarker;
      boatMarkerRef.current = boatMarker;
      coverageCircleRef.current = coverageCircle;
      lineRef.current = linkLine;
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
    let mounted = true;

    async function loadData() {
      const data = await fetchBoats();
      if (!mounted) return;
      setBoats(data);

      const latestBoat = [...data].sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime())[0] ?? null;
      setActiveBoat(latestBoat);

      if (latestBoat && latestBoat.location) {
        const nextCoords: [number, number] = [Number(latestBoat.location.latitude), Number(latestBoat.location.longitude)];
        setBoatCoords(nextCoords);
        setLocationName(`${latestBoat.boatId} latest position`);
        if (mapInstanceRef.current) updateMapPositions(gatewayCoords, nextCoords);

        if (boatMarkerRef.current) {
          boatMarkerRef.current.setPopupContent(`
            <div style="font-family:inherit;padding:6px;min-width:180px;">
              <strong style="color:#16a34a;font-size:1.1em;">${latestBoat.boatId}</strong>
              <span style="margin-left:6px;color:#64748b;font-size:0.85em;">Node #${latestBoat.nodeId}</span><br/>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:6px 0;"/>
              <div style="font-size:0.85em;line-height:1.5;">
                Status: <b style="color:#16a34a;">${latestBoat.status}</b><br/>
                Heartbeats: <b>${latestBoat.heartbeatCount}</b><br/>
                Signal RSSI: <b>${latestBoat.rssi ?? "—"} dBm</b><br/>
                Signal SNR: <b>${latestBoat.snr ?? "—"} dB</b><br/>
                Last Seen: <b>${new Date(latestBoat.lastSeen).toLocaleTimeString()}</b>
              </div>
            </div>
          `);
        }
      } else if (boatMarkerRef.current) {
        boatMarkerRef.current.setPopupContent(`
          <div style="font-family:inherit;padding:4px;">
            <strong style="color:#64748b;font-size:1.1em;">No live vessel position</strong><br/>
            <span style="color:#64748b;font-size:0.85em;">The backend has not reported GPS coordinates yet.</span>
          </div>
        `);
      }
    }

    loadData();
    const interval = setInterval(loadData, 2000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [gatewayCoords]);

  return (
    <Card className="live-map-workspace" style={{ padding: "1.25rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem", flexWrap: "wrap", gap: "0.5rem" }}>
        <div>
          <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Live Maritime Map & Radar</h2>
          <p style={{ color: "#64748b", fontSize: "0.85rem", margin: "4px 0 0 0" }}>
            Real-time positioning & LoRa radio telemetry • <strong style={{ color: "#0284c7" }}>{locationName}</strong>
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            onClick={requestCurrentLocation}
            style={{
              background: "#f0fdf4",
              color: "#15803d",
              border: "1px solid #86efac",
              padding: "6px 12px",
              borderRadius: "6px",
              fontWeight: 600,
              fontSize: "0.8rem",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              cursor: "pointer",
            }}
          >
            📍 Use Current Location
          </button>
          <StatusBadge label="MAP LIVE" tone="healthy" />
          <StatusBadge label={activeBoat ? "RF LINK ACTIVE" : "RF LINK UNAVAILABLE"} tone={activeBoat ? "healthy" : "neutral"} />
        </div>
      </div>

      <div
        ref={mapContainerRef}
        style={{
          width: "100%",
          height: "480px",
          borderRadius: "10px",
          overflow: "hidden",
          border: "1px solid #cbd5e1",
          boxShadow: "inset 0 0 10px rgba(0,0,0,0.05)",
          zIndex: 1,
        }}
      />

      {/* Telemetry Summary Bar below Map */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginTop: "1.25rem",
          padding: "1rem",
          background: "rgba(241, 245, 249, 0.6)",
          borderRadius: "8px",
          border: "1px solid #e2e8f0",
          fontSize: "0.85rem",
        }}
      >
        <div>
          <span style={{ color: "#64748b", display: "block" }}>TRACKED VESSEL</span>
          <strong style={{ fontSize: "1.05rem", color: "#0f172a" }}>
            {activeBoat ? `${activeBoat.boatId} (Node #${activeBoat.nodeId})` : "No live vessel data"}
          </strong>
        </div>
        <div>
          <span style={{ color: "#64748b", display: "block" }}>LORA SIGNAL STRENGTH</span>
          <strong style={{ fontSize: "1.05rem", color: "#0284c7" }}>
            {activeBoat?.rssi != null ? `${activeBoat.rssi} dBm` : "Unavailable"}{" "}
            <span style={{ fontSize: "0.85rem", color: "#64748b" }}>
              (SNR: {activeBoat?.snr != null ? `${activeBoat.snr} dB` : "Unavailable"})
            </span>
          </strong>
        </div>
        <div>
          <span style={{ color: "#64748b", display: "block" }}>HEARTBEAT INGESTION</span>
          <strong style={{ fontSize: "1.05rem", color: "#16a34a" }}>
            {activeBoat?.heartbeatCount ? `${activeBoat.heartbeatCount} Packets Received` : "Unavailable"}
          </strong>
        </div>
        <div>
          <span style={{ color: "#64748b", display: "block" }}>CURRENT COORDINATES</span>
          <strong style={{ fontSize: "1rem", color: "#334155" }}>
            {gatewayCoords[0].toFixed(4)}° N, {gatewayCoords[1].toFixed(4)}° E
          </strong>
        </div>
      </div>
    </Card>
  );
}
