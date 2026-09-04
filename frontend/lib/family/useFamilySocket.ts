"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { FamilyWebSocketEvent, BoatSafetyStatus, RescueStatus } from "./types";
import { API_BASE_URL, localStore } from "./familyApi";

type EventHandler = (event: FamilyWebSocketEvent) => void;

class FamilyEventBus {
  private listeners: Set<EventHandler> = new Set();

  subscribe(handler: EventHandler) {
    this.listeners.add(handler);
    return () => {
      this.listeners.delete(handler);
    };
  }

  dispatch(event: FamilyWebSocketEvent) {
    // Also update localStore so reads stay coherent
    if (event.type === "boat.location.updated") {
      localStore.updateBoatLocation(event.boatId, {
        latitude: event.latitude,
        longitude: event.longitude,
        timestamp: event.timestamp,
        isLive: true,
        speedKnots: event.speedKnots,
        headingDeg: event.headingDeg,
      });
    } else if (event.type === "boat.status.updated") {
      localStore.setBoatStatus(event.boatId, event.status);
    } else if (event.type === "sos.created") {
      localStore.saveIncident({
        id: event.incidentId,
        boatId: event.boatId,
        boatName: localStore.getBoat(event.boatId)?.name || event.boatId,
        timestamp: event.timestamp,
        status: "ACTIVE",
        statusLabel: "Emergency reported",
        location: {
          latitude: event.latitude,
          longitude: event.longitude,
          timestamp: event.timestamp,
          isLive: false,
        },
        details: event.details || "Distress beacon activated from vessel.",
        updatedAt: event.timestamp,
        rescueContact: "Indian Coast Guard MRCC Vizag: +91 891 256 0148 / Toll-Free 1554",
      });
    } else if (
      event.type === "sos.acknowledged" ||
      event.type === "sos.dispatched" ||
      event.type === "sos.resolved"
    ) {
      const inc = localStore.getIncident(event.incidentId);
      if (inc) {
        inc.status = event.status as RescueStatus;
        inc.updatedAt = event.timestamp;
        if (event.status === "ACKNOWLEDGED") {
          inc.statusLabel = "Rescue team notified";
          inc.acknowledgedAt = event.timestamp;
        } else if (event.status === "DISPATCHED") {
          inc.statusLabel = "Rescue team dispatched";
          inc.dispatchedAt = event.timestamp;
        } else if (event.status === "RESOLVED") {
          inc.statusLabel = "Incident resolved";
          inc.resolvedAt = event.timestamp;
        }
        localStore.saveIncident(inc);
      }
    }

    // Notify all active React subscribers
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.error("Error in family event listener", err);
      }
    });
  }
}

export const familyBus = new FamilyEventBus();

export function useFamilySocket(boatId?: string) {
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [lastEvent, setLastEvent] = useState<FamilyWebSocketEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Connect to real backend WebSocket if available
  useEffect(() => {
    const wsUrl = API_BASE_URL.replace(/^http/, "ws") + "/api/family/ws";
    let ws: WebSocket | null = null;

    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
      };

      ws.onmessage = (evt) => {
        try {
          const parsed: FamilyWebSocketEvent = JSON.parse(evt.data);
          if (!boatId || !("boatId" in parsed) || parsed.boatId.toLowerCase() === boatId.toLowerCase()) {
            setLastEvent(parsed);
            familyBus.dispatch(parsed);
          }
        } catch {
          // Non-JSON or unrecognized payload
        }
      };

      ws.onerror = () => {
        setIsConnected(false);
      };

      ws.onclose = () => {
        setIsConnected(false);
      };
    } catch {
      setIsConnected(false);
    }

    // Subscribe to internal bus for synchronized simulated & peer events
    const unsubscribe = familyBus.subscribe((event) => {
      if (!boatId || !("boatId" in event) || event.boatId.toLowerCase() === boatId.toLowerCase()) {
        setLastEvent(event);
      }
    });

    return () => {
      unsubscribe();
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [boatId]);

  const emitEvent = useCallback((event: FamilyWebSocketEvent) => {
    familyBus.dispatch(event);
  }, []);

  return {
    isConnected,
    lastEvent,
    emitEvent,
  };
}
