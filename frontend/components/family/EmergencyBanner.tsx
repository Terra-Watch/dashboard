"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { SOSIncident } from "../../lib/family/types";
import { fetchBoatIncidents } from "../../lib/family/familyApi";
import { useFamilySocket } from "../../lib/family/useFamilySocket";

interface EmergencyBannerProps {
  boatId?: string;
}

export function EmergencyBanner({ boatId }: EmergencyBannerProps) {
  const [activeIncident, setActiveIncident] = useState<SOSIncident | null>(null);
  const { lastEvent } = useFamilySocket(boatId);

  // Check initial active incidents
  const loadIncidents = async () => {
    try {
      const incidents = await fetchBoatIncidents(boatId || "");
      const ongoing = incidents.find((i) => i.status !== "RESOLVED");
      setActiveIncident(ongoing || null);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    loadIncidents();
  }, [boatId]);

  // React to incoming live WebSocket events
  useEffect(() => {
    if (!lastEvent) return;

    if (lastEvent.type === "sos.created") {
      setActiveIncident({
        id: lastEvent.incidentId,
        boatId: lastEvent.boatId,
        boatName: lastEvent.boatId,
        timestamp: lastEvent.timestamp,
        status: "ACTIVE",
        statusLabel: "Emergency reported",
        location: {
          latitude: lastEvent.latitude,
          longitude: lastEvent.longitude,
          timestamp: lastEvent.timestamp,
          isLive: false,
        },
        details: lastEvent.details || "Distress beacon activated from vessel.",
        updatedAt: lastEvent.timestamp,
      });
    } else if (
      lastEvent.type === "sos.acknowledged" ||
      lastEvent.type === "sos.dispatched"
    ) {
      setActiveIncident((prev) => {
        if (!prev || prev.id !== lastEvent.incidentId) return prev;
        return {
          ...prev,
          status: lastEvent.status,
          statusLabel:
            lastEvent.status === "ACKNOWLEDGED"
              ? "Rescue team notified"
              : "Rescue team dispatched",
          updatedAt: lastEvent.timestamp,
        };
      });
    } else if (lastEvent.type === "sos.resolved") {
      // Dismiss active banner when resolved
      setActiveIncident(null);
    }
  }, [lastEvent]);

  if (!activeIncident) return null;

  return (
    <aside style={styles.banner} role="alert" aria-live="assertive">
      <div style={styles.container}>
        <div style={styles.left}>
          <div style={styles.beaconPulse}>SOS</div>
          <div>
            <div style={styles.titleRow}>
              <span style={styles.title}>EMERGENCY ALERT</span>
              <span style={styles.boatBadge}>{activeIncident.boatId}</span>
              <span style={styles.statusPill}>{activeIncident.statusLabel}</span>
            </div>
            <p style={styles.message}>
              Distress beacon triggered for <strong>{activeIncident.boatName || activeIncident.boatId}</strong>.
              Coast Guard / Rescue operators have been alerted.
            </p>
          </div>
        </div>

        <div style={styles.actionCluster}>
          <Link
            href={`/family/incident/${activeIncident.id}`}
            style={styles.actionButton}
          >
            VIEW EMERGENCY DETAILS & LOCATION →
          </Link>
        </div>
      </div>
    </aside>
  );
}

const styles: Record<string, React.CSSProperties> = {
  banner: {
    backgroundColor: "#7f1d1d",
    color: "#ffffff",
    borderBottom: "2px solid #ef4444",
    padding: "12px 16px",
    boxShadow: "0 4px 14px rgba(220, 38, 38, 0.35)",
    position: "relative",
    zIndex: 35,
  },
  container: {
    maxWidth: "1080px",
    margin: "0 auto",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: "16px",
    flexWrap: "wrap",
  },
  left: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    flex: 1,
    minWidth: "280px",
  },
  beaconPulse: {
    fontSize: "1.75rem",
    animation: "pulse 1.2s ease-in-out infinite",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
    marginBottom: "2px",
  },
  title: {
    fontWeight: "800",
    letterSpacing: "0.06em",
    fontSize: "0.95rem",
    color: "#fecaca",
  },
  boatBadge: {
    background: "rgba(255, 255, 255, 0.2)",
    color: "#ffffff",
    padding: "2px 8px",
    borderRadius: "4px",
    fontSize: "0.8rem",
    fontWeight: "700",
  },
  statusPill: {
    background: "#ef4444",
    color: "#ffffff",
    padding: "2px 8px",
    borderRadius: "10px",
    fontSize: "0.72rem",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  message: {
    margin: 0,
    fontSize: "0.82rem",
    color: "#fee2e2",
    lineHeight: "1.35",
  },
  actionCluster: {
    display: "flex",
    alignItems: "center",
  },
  actionButton: {
    display: "inline-block",
    backgroundColor: "#ffffff",
    color: "#991b1b",
    padding: "8px 14px",
    borderRadius: "6px",
    fontWeight: "700",
    fontSize: "0.82rem",
    letterSpacing: "0.02em",
    textDecoration: "none",
    boxShadow: "0 2px 6px rgba(0, 0, 0, 0.2)",
    whiteSpace: "nowrap",
  },
};
