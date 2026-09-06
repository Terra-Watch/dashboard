"use client";

import React, { useState } from "react";
import { FamilyTrip } from "../../lib/family/types";

interface TripCardProps {
  trip: FamilyTrip;
  boatName: string;
}

export function TripCard({ trip, boatName }: TripCardProps) {
  const [expanded, setExpanded] = useState<boolean>(false);

  const statusBadge = {
    ACTIVE: { label: "IN PROGRESS", bg: "#e0f2fe", color: "#0369a1", icon: "⛵" },
    COMPLETED: { label: "COMPLETED", bg: "#dcfce7", color: "#15803d", icon: "✓" },
    INTERRUPTED: { label: "INTERRUPTED / SAFE RETURN", bg: "#fee2e2", color: "#b91c1c", icon: "⚠️" },
  }[trip.status] || { label: "LOGGED", bg: "#f1f5f9", color: "#475569", icon: "•" };

  return (
    <div style={styles.card}>
      {/* Header Row */}
      <div style={styles.headerRow} onClick={() => setExpanded(!expanded)}>
        <div style={styles.dateBlock}>
          <span style={styles.dateText}>{trip.date}</span>
          <span style={styles.titleText}>{trip.title}</span>
        </div>

        <div style={styles.statusBlock}>
          <span
            style={{
              ...styles.badge,
              backgroundColor: statusBadge.bg,
              color: statusBadge.color,
            }}
          >
            {statusBadge.icon} {statusBadge.label}
          </span>
          <button
            type="button"
            style={styles.expandToggle}
            aria-expanded={expanded}
          >
            {expanded ? "Hide Details ▲" : "View Details ▼"}
          </button>
        </div>
      </div>

      {/* Summary Row */}
      <div style={styles.summaryRow}>
        <div style={styles.timeCluster}>
          <span style={styles.timeLabel}>Voyage Timeline:</span>
          <span style={styles.timeValue}>
            {trip.startTime} → {trip.endTime || "Active at sea"}
          </span>
          {trip.durationFormatted && (
            <span style={styles.durationTag}>({trip.durationFormatted})</span>
          )}
        </div>

        <div style={styles.portCluster}>
          <span style={styles.portText}>
            {trip.departurePort} {trip.arrivalPort && `→ ${trip.arrivalPort}`}
          </span>
        </div>
      </div>

      {/* Expanded Trip Details */}
      {expanded && (
        <div style={styles.detailsPanel}>
          <h4 style={styles.detailsHeading}>Trip Operational Summary</h4>

          <div style={styles.detailsGrid}>
            <div style={styles.detailItem}>
              <span style={styles.itemLabel}>Departure Harbour</span>
              <span style={styles.itemValue}>{trip.departurePort}</span>
            </div>

            <div style={styles.detailItem}>
              <span style={styles.itemLabel}>Return / Arrival Port</span>
              <span style={styles.itemValue}>{trip.arrivalPort || "Pending return"}</span>
            </div>

            <div style={styles.detailItem}>
              <span style={styles.itemLabel}>Estimated Distance</span>
              <span style={styles.itemValue}>
                {trip.distanceNauticalMiles
                  ? `${trip.distanceNauticalMiles} Nautical Miles`
                  : "Under calculation"}
              </span>
            </div>

            <div style={styles.detailItem}>
              <span style={styles.itemLabel}>Vessel</span>
              <span style={styles.itemValue}>{boatName} ({trip.boatId})</span>
            </div>
          </div>

          {/* Safety Warnings & Coast Guard Bulletins */}
          {trip.safetyWarnings && trip.safetyWarnings.length > 0 && (
            <div style={styles.warningBox}>
              <strong style={styles.warningBoxTitle}>⚠️ Coastal Weather & Safety Notes:</strong>
              <ul style={styles.warningList}>
                {trip.safetyWarnings.map((w, idx) => (
                  <li key={idx} style={styles.warningItem}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Waypoints Sequence */}
          {trip.waypoints && trip.waypoints.length > 0 && (
            <div style={styles.routeBox}>
              <span style={styles.routeTitle}>GPS Anchor Points:</span>
              <div style={styles.waypointList}>
                {trip.waypoints.map((wp, idx) => (
                  <div key={idx} style={styles.waypointItem}>
                    <span style={styles.wpNumber}>#{idx + 1}</span>
                    <span style={styles.wpCoord}>
                      {wp.latitude.toFixed(4)}° N, {wp.longitude.toFixed(4)}° E
                    </span>
                    <span style={styles.wpTime}>@{wp.timestamp}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    transition: "box-shadow 0.15s ease",
  },
  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    cursor: "pointer",
    flexWrap: "wrap",
    gap: "8px",
  },
  dateBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  dateText: {
    fontSize: "1.05rem",
    fontWeight: "800",
    color: "#1e293b",
  },
  titleText: {
    fontSize: "0.82rem",
    color: "#64748b",
  },
  statusBlock: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  badge: {
    fontSize: "0.72rem",
    fontWeight: "700",
    padding: "4px 8px",
    borderRadius: "6px",
    letterSpacing: "0.03em",
  },
  expandToggle: {
    background: "transparent",
    border: "none",
    color: "#0284c7",
    fontSize: "0.78rem",
    fontWeight: "600",
    cursor: "pointer",
  },
  summaryRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "10px",
    borderTop: "1px solid #f1f5f9",
    paddingTop: "10px",
  },
  timeCluster: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    flexWrap: "wrap",
  },
  timeLabel: {
    fontSize: "0.75rem",
    color: "#64748b",
  },
  timeValue: {
    fontSize: "0.85rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  durationTag: {
    fontSize: "0.75rem",
    color: "#0369a1",
    fontWeight: "600",
  },
  portCluster: {
    fontSize: "0.8rem",
    color: "#475569",
  },
  portText: {
    fontWeight: "500",
  },
  detailsPanel: {
    marginTop: "8px",
    backgroundColor: "#f8fafc",
    borderRadius: "8px",
    padding: "14px",
    border: "1px solid #f1f5f9",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  detailsHeading: {
    margin: 0,
    fontSize: "0.88rem",
    fontWeight: "700",
    color: "#334155",
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "10px",
  },
  detailItem: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  itemLabel: {
    fontSize: "0.68rem",
    color: "#64748b",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  itemValue: {
    fontSize: "0.82rem",
    fontWeight: "600",
    color: "#1e293b",
  },
  warningBox: {
    backgroundColor: "#fffbeb",
    border: "1px solid #fef3c7",
    borderRadius: "6px",
    padding: "10px 12px",
  },
  warningBoxTitle: {
    fontSize: "0.78rem",
    color: "#92400e",
    display: "block",
    marginBottom: "4px",
  },
  warningList: {
    margin: 0,
    paddingLeft: "18px",
    fontSize: "0.75rem",
    color: "#78350f",
  },
  warningItem: {
    marginBottom: "2px",
  },
  routeBox: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  routeTitle: {
    fontSize: "0.72rem",
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
  },
  waypointList: {
    display: "flex",
    flexWrap: "wrap",
    gap: "6px",
  },
  waypointItem: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "4px",
    padding: "4px 8px",
    fontSize: "0.72rem",
  },
  wpNumber: {
    fontWeight: "700",
    color: "#0284c7",
  },
  wpCoord: {
    color: "#334155",
    fontFamily: "monospace",
  },
  wpTime: {
    color: "#94a3b8",
  },
};
