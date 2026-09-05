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
      event.type === "sos.rescued" ||
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
        } else if (event.status === "RESCUED") {
          inc.statusLabel = "Crew secured / rescued";
          inc.rescuedAt = event.timestamp;
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
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [lastEvent, setLastEvent] = useState<FamilyWebSocketEvent | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const backoffRef = useRef<number>(1000);

  // Connect to real backend WebSocket with token and exponential backoff
  useEffect(() => {
    let isCancelled = false;

    function connect() {
      if (isCancelled) return;

      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("jalari_token")
          : null;

      if (!token) {
        setIsConnected(false);
        return;
      }

      const wsBase = API_BASE_URL.replace(/^http/, "ws") + "/api/family/ws";
      const wsUrl = `${wsBase}?token=${encodeURIComponent(token)}`;

      try {
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          if (isCancelled) {
            ws.close();
            return;
          }
          setIsConnected(true);
          backoffRef.current = 1000; // Reset backoff on successful connect
        };

        ws.onmessage = (evt) => {
          try {
            const parsed: FamilyWebSocketEvent = JSON.parse(evt.data);
            if (!boatId || !("boatId" in parsed) || parsed.boatId.toLowerCase() === boatId.toLowerCase()) {
              setLastEvent(parsed);
              familyBus.dispatch(parsed);
            }
          } catch {
            // Non-JSON or ping/pong payload
          }
        };

        ws.onerror = () => {
          setIsConnected(false);
        };

        ws.onclose = (evt) => {
          setIsConnected(false);
          wsRef.current = null;
          // Only reconnect if not intentionally closed and not cancelled
          if (!isCancelled && evt.code !== 1000 && evt.code !== 4001 && evt.code !== 4003) {
            const nextDelay = Math.min(backoffRef.current * 1.5, 15000);
            backoffRef.current = nextDelay;
            reconnectTimeoutRef.current = setTimeout(connect, nextDelay);
          }
        };
      } catch {
        setIsConnected(false);
      }
    }

    connect();

    // Subscribe to internal bus for synchronized simulated & peer events
    const unsubscribe = familyBus.subscribe((event) => {
      if (!boatId || !("boatId" in event) || event.boatId.toLowerCase() === boatId.toLowerCase()) {
        setLastEvent(event);
      }
    });

    return () => {
      isCancelled = true;
      unsubscribe();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close(1000, "Unmounting");
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
