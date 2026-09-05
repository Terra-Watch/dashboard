"use client";

import React from "react";
import Link from "next/link";
import { FamilyBoat } from "../../lib/family/types";
import { LastUpdatedBadge } from "./LastUpdatedBadge";

interface BoatStatusCardProps {
  boat: FamilyBoat;
  isPrimary?: boolean;
}

export function BoatStatusCard({ boat, isPrimary = true }: BoatStatusCardProps) {
  const isEmergency = boat.safetyStatus === "EMERGENCY";
  const isWarning = boat.safetyStatus === "WARNING";

  const statusConfig = {
    SAFE: {
      color: "#15803d",
      bg: "#dcfce7",
      border: "#86efac",
      icon: "🟢",
      label: "SAFE",
      description: "Vessel is operating normally with no active alerts.",
    },
    WARNING: {
      color: "#b45309",
      bg: "#fef3c7",
      border: "#fde68a",
      icon: "🟡",
      label: "WEATHER / SWELL WARNING",
      description: "Cautionary advisory issued for this maritime area.",
    },
    EMERGENCY: {
      color: "#b91c1c",
      bg: "#fee2e2",
      border: "#fca5a5",
      icon: "🚨",
      label: "DISTRESS REPORTED",
      description: "Emergency beacon active. Rescue coordination in progress.",
    },
  }[boat.safetyStatus] || {
    color: "#475569",
    bg: "#f1f5f9",
    border: "#cbd5e1",
    icon: "⚪",
    label: "UNKNOWN",
    description: "Status awaiting synchronization.",
  };

  const tripConfig = {
    ON_TRIP: { label: "AT SEA (ON TRIP)", color: "#0369a1", bg: "#e0f2fe" },
    AT_PORT: { label: "SAFE AT PORT", color: "#15803d", bg: "#dcfce7" },
    COMPLETED: { label: "VOYAGE COMPLETED", color: "#475569", bg: "#f1f5f9" },
  }[boat.tripState] || { label: "AT SEA", color: "#0369a1", bg: "#e0f2fe" };

  return (
    <div
      style={{
        ...styles.card,
        borderColor: isEmergency ? "#ef4444" : isWarning ? "#f59e0b" : "#e2e8f0",
        boxShadow: isEmergency
          ? "0 8px 24px rgba(239, 68, 68, 0.18)"
          : "0 4px 12px rgba(0, 0, 0, 0.05)",
      }}
    >
      {/* Top Bar: Vessel Identification */}
      <div style={styles.cardHeader}>
        <div style={styles.identityGroup}>
          <div style={styles.boatIcon}>🚤</div>
          <div>
            <h2 style={styles.boatName}>{boat.name}</h2>
            <div style={styles.idSubrow}>
              <span style={styles.boatIdBadge}>{boat.boatId}</span>
              <span style={styles.homePort}>{boat.homePort}</span>
            </div>
          </div>
        </div>

        {/* Trip State Badge */}
        <div
          style={{
            ...styles.tripBadge,
            color: tripConfig.color,
            backgroundColor: tripConfig.bg,
          }}
        >
          {tripConfig.label}
        </div>
      </div>

      {/* Safety Status Spotlight */}
      <div
        style={{
          ...styles.statusBanner,
          backgroundColor: statusConfig.bg,
          borderColor: statusConfig.border,
          color: statusConfig.color,
        }}
      >
        <div style={styles.statusRow}>
          <span style={styles.statusIcon}>{statusConfig.icon}</span>
          <span style={styles.statusText}>{statusConfig.label}</span>
        </div>
        <p style={styles.statusDesc}>{statusConfig.description}</p>
      </div>

      {/* Location & Freshness Section */}
      <div style={styles.locationSection}>
        <div style={styles.locationMeta}>
          <span style={styles.labelMuted}>Latest Reported Position</span>
          <div style={styles.coordDisplay}>
            {boat.latestLocation ? (
              <>
                <span style={styles.coordText}>
                  {boat.latestLocation.latitude.toFixed(4)}° N,{" "}
                  {boat.latestLocation.longitude.toFixed(4)}° E
                </span>
                {boat.latestLocation.speedKnots !== undefined && (
                  <span style={styles.speedTag}>
                    Speed: {boat.latestLocation.speedKnots} kn
                  </span>
                )}
              </>
            ) : (
              <span style={styles.coordText}>Coordinates Unavailable</span>
            )}
          </div>
        </div>

        {/* Live vs Last Known Indicator */}
        <div style={styles.freshnessWrapper}>
          <LastUpdatedBadge
            timestamp={boat.latestLocation?.timestamp}
            isLive={boat.latestLocation?.isLive}
            showExplanation={true}
          />
        </div>
      </div>

      {/* Family Crew Details (peace of mind) */}
      {(boat.captainName || boat.crewCount) && (
        <div style={styles.crewStrip}>
          {boat.captainName && (
            <span style={styles.crewItem}>
              👤 <strong>Captain:</strong> {boat.captainName}
            </span>
          )}
          {boat.crewCount && (
            <span style={styles.crewItem}>
              👥 <strong>Crew Onboard:</strong> {boat.crewCount} members
            </span>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div style={styles.actions}>
        <Link
          href={`/family/boat/${encodeURIComponent(boat.boatId)}`}
          style={styles.btnPrimary}
        >
          <span style={styles.btnIcon}>🗺️</span>
          VIEW LOCATION ON MAP
        </Link>
        <Link
          href={`/family/boat/${encodeURIComponent(boat.boatId)}/history`}
          style={styles.btnSecondary}
        >
          <span style={styles.btnIcon}>📋</span>
          VIEW TRIP HISTORY
        </Link>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    padding: "20px",
    display: "flex",
    flexDirection: "column",
    gap: "16px",
    transition: "all 0.2s ease",
  },
  cardHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: "12px",
    flexWrap: "wrap",
  },
  identityGroup: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  boatIcon: {
    fontSize: "2rem",
    background: "#f1f5f9",
    width: "48px",
    height: "48px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  boatName: {
    margin: 0,
    fontSize: "1.25rem",
    fontWeight: "800",
    color: "#1e293b",
  },
  idSubrow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    marginTop: "3px",
  },
  boatIdBadge: {
    fontSize: "0.75rem",
    fontWeight: "700",
    color: "#29434d",
    backgroundColor: "#e2e8f0",
    padding: "2px 6px",
    borderRadius: "4px",
    letterSpacing: "0.04em",
  },
  homePort: {
    fontSize: "0.75rem",
    color: "#64748b",
  },
  tripBadge: {
    fontSize: "0.72rem",
    fontWeight: "700",
    padding: "4px 10px",
    borderRadius: "12px",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  statusBanner: {
    borderRadius: "8px",
    border: "1px solid",
    padding: "12px 14px",
  },
  statusRow: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  statusIcon: {
    fontSize: "1.1rem",
  },
  statusText: {
    fontSize: "0.95rem",
    fontWeight: "800",
    letterSpacing: "0.03em",
  },
  statusDesc: {
    margin: "4px 0 0 0",
    fontSize: "0.78rem",
    opacity: 0.9,
    lineHeight: "1.35",
  },
  locationSection: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    backgroundColor: "#f8fafc",
    padding: "14px",
    borderRadius: "8px",
    border: "1px solid #f1f5f9",
  },
  locationMeta: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
  },
  labelMuted: {
    fontSize: "0.72rem",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: "600",
  },
  coordDisplay: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    flexWrap: "wrap",
  },
  coordText: {
    fontSize: "1.05rem",
    fontWeight: "700",
    color: "#0f172a",
    fontFamily: "monospace",
  },
  speedTag: {
    fontSize: "0.75rem",
    color: "#0284c7",
    background: "#e0f2fe",
    padding: "2px 6px",
    borderRadius: "4px",
    fontWeight: "600",
  },
  freshnessWrapper: {
    marginTop: "2px",
  },
  crewStrip: {
    display: "flex",
    gap: "16px",
    fontSize: "0.78rem",
    color: "#475569",
    borderTop: "1px dashed #e2e8f0",
    paddingTop: "10px",
    flexWrap: "wrap",
  },
  crewItem: {
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
  },
  actions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: "10px",
    marginTop: "4px",
  },
  btnPrimary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    backgroundColor: "#29434d",
    color: "#ffffff",
    padding: "12px 14px",
    borderRadius: "8px",
    fontWeight: "700",
    fontSize: "0.82rem",
    textDecoration: "none",
    letterSpacing: "0.02em",
    textAlign: "center",
    transition: "background 0.15s ease",
  },
  btnSecondary: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    backgroundColor: "#f1f5f9",
    color: "#1e293b",
    border: "1px solid #cbd5e1",
    padding: "12px 14px",
    borderRadius: "8px",
    fontWeight: "700",
    fontSize: "0.82rem",
    textDecoration: "none",
    letterSpacing: "0.02em",
    textAlign: "center",
    transition: "background 0.15s ease",
  },
  btnIcon: {
    fontSize: "1rem",
  },
};
