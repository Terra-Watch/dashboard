"use client";

import React, { useEffect, useRef } from "react";
import { BoatLocation, BoatSafetyStatus } from "../../lib/family/types";
import "leaflet/dist/leaflet.css";

interface FamilyBoatMapProps {
  boatId: string;
  boatName: string;
  location: BoatLocation | null;
  status: BoatSafetyStatus;
  height?: string;
  homePortCoords?: [number, number];
}

export function FamilyBoatMap({
  boatId,
  boatName,
  location,
  status,
  height = "420px",
  homePortCoords,
}: FamilyBoatMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const LRef = useRef<any>(null);
  const boatMarkerRef = useRef<any>(null);
  const portMarkerRef = useRef<any>(null);
  const trackLineRef = useRef<any>(null);

  const isEmergency = status === "EMERGENCY";
  const isWarning = status === "WARNING";

  const targetCoords: [number, number] = location
    ? [location.latitude, location.longitude]
    : homePortCoords || [0, 0];

  useEffect(() => {
    let map: any = null;

    async function initMap() {
      if (!mapContainerRef.current) return;

      const L = (await import("leaflet")).default;
      LRef.current = L;

      // If Leaflet already initialized this container (React Strict Mode double-invoke),
      // destroy the old instance cleanly before creating a new one.
      const container = mapContainerRef.current as any;
      if (container._leaflet_id) {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        } else {
          // Container is marked but we lost the reference — clear Leaflet's internal ID
          container._leaflet_id = null;
        }
      }

      // Skip if another async initMap call already ran
      if (mapInstanceRef.current) return;

      // Fix default icons
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
        iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
        shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
      });

      map = L.map(mapContainerRef.current, {
        center: targetCoords,
        zoom: location ? 13 : 11,
        zoomControl: true,
      });
      mapInstanceRef.current = map;

      // OpenStreetMap basemap with clean global coastal coverage
      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 19,
        }
      ).addTo(map);

      // Home Port Marker
      const portIcon = L.divIcon({
        className: "jalari-port-marker",
        html: `<div style="background:#29434d;color:white;width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);">PORT</div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
      });

      if (homePortCoords) {
        portMarkerRef.current = L.marker(homePortCoords, { icon: portIcon })
          .addTo(map)
          .bindPopup(`
          <div style="font-family:sans-serif;padding:4px;">
            <strong style="color:#29434d;font-size:0.95em;">Home port</strong>
          </div>
        `);
      }

      // Boat Marker
      if (location) {
        createOrUpdateBoatMarker(location, status);
      }
    }

    initMap();

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update boat marker when coordinates or status changes
  useEffect(() => {
    if (!location || !mapInstanceRef.current || !LRef.current) return;
    createOrUpdateBoatMarker(location, status);
  }, [location?.latitude, location?.longitude, status]);

  function createOrUpdateBoatMarker(loc: BoatLocation, boatStatus: BoatSafetyStatus) {
    const L = LRef.current;
    const map = mapInstanceRef.current;
    if (!L || !map) return;

    const coords: [number, number] = [loc.latitude, loc.longitude];

    const markerColor =
      boatStatus === "EMERGENCY"
        ? "#dc2626"
        : boatStatus === "WARNING"
        ? "#d97706"
        : "#16a34a";

    const pulseShadow =
      boatStatus === "EMERGENCY"
        ? "0 0 0 8px rgba(220, 38, 38, 0.4)"
        : boatStatus === "WARNING"
        ? "0 0 0 6px rgba(217, 119, 6, 0.3)"
        : "0 0 0 5px rgba(22, 163, 74, 0.25)";

    const boatIcon = L.divIcon({
      className: "jalari-family-boat-marker",
      html: `
        <div style="
          background: ${markerColor};
          color: white;
          width: 38px;
          height: 38px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 18px;
          border: 3px solid white;
          box-shadow: ${pulseShadow};
          transition: transform 0.3s ease;
        ">
          <span aria-hidden="true">●</span>
        </div>
      `,
      iconSize: [38, 38],
      iconAnchor: [19, 19],
    });

    const popupHtml = `
      <div style="font-family:sans-serif;padding:6px;min-width:180px;">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
          <strong style="color:#0f172a;font-size:1.05em;">${boatName}</strong>
          <span style="background:#e2e8f0;font-size:0.75em;padding:2px 5px;border-radius:3px;font-weight:700;">${boatId}</span>
        </div>
        <div style="font-size:0.82em;color:${markerColor};font-weight:700;margin-bottom:6px;">
          ● ${boatStatus}
        </div>
        <div style="font-size:0.8em;color:#475569;line-height:1.4;">
          Coordinates: <b>${loc.latitude.toFixed(4)}° N, ${loc.longitude.toFixed(4)}° E</b><br/>
          ${loc.speedKnots ? `Speed: <b>${loc.speedKnots} knots</b><br/>` : ""}
          Reported: <b>${new Date(loc.timestamp).toLocaleTimeString()}</b>
        </div>
      </div>
    `;

    if (!boatMarkerRef.current) {
      boatMarkerRef.current = L.marker(coords, { icon: boatIcon })
        .addTo(map)
        .bindPopup(popupHtml);
    } else {
      boatMarkerRef.current.setLatLng(coords);
      boatMarkerRef.current.setIcon(boatIcon);
      boatMarkerRef.current.setPopupContent(popupHtml);
    }

    // Connect dashed guide line to harbour
    if (!homePortCoords) return;
    if (trackLineRef.current) {
      trackLineRef.current.setLatLngs([homePortCoords, coords]);
    } else {
      trackLineRef.current = L.polyline([homePortCoords, coords], {
        color: "#0284c7",
        weight: 2,
        dashArray: "6, 8",
        opacity: 0.65,
      }).addTo(map);
    }

    // Smooth pan to boat
    map.panTo(coords, { animate: true, duration: 1.2 });
  }

  const handleRecenter = () => {
    if (mapInstanceRef.current && location) {
      mapInstanceRef.current.flyTo([location.latitude, location.longitude], 13, {
        duration: 1,
      });
    }
  };

  return (
    <div style={styles.wrapper}>
      <div
        ref={mapContainerRef}
        style={{ width: "100%", height, borderRadius: "10px", zIndex: 1 }}
      />
      {location && (
        <button
          onClick={handleRecenter}
          style={styles.recenterBtn}
          title="Re-center on Boat"
        >
          Re-center
        </button>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    position: "relative",
    width: "100%",
    borderRadius: "10px",
    overflow: "hidden",
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
    border: "1px solid #cbd5e1",
  },
  recenterBtn: {
    position: "absolute",
    bottom: "16px",
    left: "16px",
    zIndex: 400,
    backgroundColor: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "0.78rem",
    fontWeight: "700",
    color: "#29434d",
    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.15)",
    cursor: "pointer",
  },
};
