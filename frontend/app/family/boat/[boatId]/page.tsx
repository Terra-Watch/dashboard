"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { fetchFamilyBoatById, fetchBoatLocation } from "../../../../lib/family/familyApi";
import { FamilyBoat, BoatLocation } from "../../../../lib/family/types";
import { FamilyBoatMap } from "../../../../components/family/FamilyBoatMap";
import { LastUpdatedBadge } from "../../../../components/family/LastUpdatedBadge";
import { useFamilySocket } from "../../../../lib/family/useFamilySocket";

interface PageProps {
  params: Promise<{ boatId: string }>;
}

export default function BoatLocationPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const boatId = decodeURIComponent(resolvedParams.boatId);

  const [boat, setBoat] = useState<FamilyBoat | null>(null);
  const [location, setLocation] = useState<BoatLocation | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { lastEvent } = useFamilySocket(boatId);

  const loadBoatData = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const boatData = await fetchFamilyBoatById(boatId);
      if (!boatData) {
        setError(`Vessel '${boatId}' not found or not assigned to your account.`);
      } else {
        setBoat(boatData);
        const loc = await fetchBoatLocation(boatId);
        setLocation(loc || boatData.latestLocation || null);
      }
    } catch {
      setError("Unable to retrieve latest vessel coordinates from shore station.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadBoatData();
  }, [boatId]);

  // Real-time updates when WebSocket events arrive
  useEffect(() => {
    if (!lastEvent) return;

    if (
      lastEvent.type === "boat.location.updated" &&
      lastEvent.boatId.toLowerCase() === boatId.toLowerCase()
    ) {
      const newLoc: BoatLocation = {
        latitude: lastEvent.latitude,
        longitude: lastEvent.longitude,
        timestamp: lastEvent.timestamp,
        isLive: true,
        speedKnots: lastEvent.speedKnots,
        headingDeg: lastEvent.headingDeg,
      };
      setLocation(newLoc);
      setBoat((prev) => (prev ? { ...prev, latestLocation: newLoc, lastSeen: newLoc.timestamp } : prev));
    } else if (
      lastEvent.type === "boat.status.updated" &&
      lastEvent.boatId.toLowerCase() === boatId.toLowerCase()
    ) {
      setBoat((prev) =>
        prev
          ? {
              ...prev,
              safetyStatus: lastEvent.status,
              tripState: lastEvent.tripState || prev.tripState,
            }
          : prev
      );
    }
  }, [lastEvent, boatId]);

  if (loading) {
    return (
      <div style={styles.centerBox}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Opening maritime tracking for {boatId}...</p>
      </div>
    );
  }

  if (error || !boat) {
    return (
      <div style={styles.centerBox}>
        <div style={styles.errorIcon}>⚠️</div>
        <h2 style={styles.errorTitle}>Vessel Unavailable</h2>
        <p style={styles.errorDesc}>{error || "Boat information could not be loaded."}</p>
        <Link href="/family" style={styles.backButton}>
          ← Return to Family Home
        </Link>
      </div>
    );
  }

  const isEmergency = boat.safetyStatus === "EMERGENCY";
  const isWarning = boat.safetyStatus === "WARNING";

  return (
    <div style={styles.container}>
      {/* Top Navigation */}
      <div style={styles.navRow}>
        <Link href="/family" style={styles.backLink}>
          ← Back to Family Dashboard
        </Link>
        <button
          onClick={() => loadBoatData(true)}
          disabled={refreshing}
          style={styles.refreshBtn}
        >
          {refreshing ? "Updating..." : "🔄 Refresh Location"}
        </button>
      </div>

      {/* Main Map Card */}
      <div style={styles.mapCard}>
        <div style={styles.mapHeader}>
          <div>
            <span style={styles.labelMuted}>MARITIME RADAR & POSITION</span>
            <h1 style={styles.pageTitle}>{boat.name} ({boat.boatId})</h1>
          </div>

          <div style={styles.statusCluster}>
            <span
              style={{
                ...styles.statusBadge,
                backgroundColor: isEmergency
                  ? "#fee2e2"
                  : isWarning
                  ? "#fef3c7"
                  : "#dcfce7",
                color: isEmergency
                  ? "#b91c1c"
                  : isWarning
                  ? "#b45309"
                  : "#15803d",
                borderColor: isEmergency
                  ? "#fca5a5"
                  : isWarning
                  ? "#fde68a"
                  : "#86efac",
              }}
            >
              {isEmergency ? "🚨 EMERGENCY" : isWarning ? "🟡 WARNING" : "🟢 SAFE"}
            </span>

            <span style={styles.tripBadge}>
              {boat.tripState === "ON_TRIP"
                ? "AT SEA (ON TRIP)"
                : boat.tripState === "AT_PORT"
                ? "AT HARBOUR"
                : "COMPLETED"}
            </span>
          </div>
        </div>

        {/* Map View */}
        <FamilyBoatMap
          boatId={boat.boatId}
          boatName={boat.name}
          location={location}
          status={boat.safetyStatus}
          height="460px"
        />

        {/* Position Details & Freshness Display */}
        <div style={styles.infoFooter}>
          <div style={styles.coordsGrid}>
            <div style={styles.coordBox}>
              <span style={styles.infoLabel}>Current Coordinates</span>
              {location ? (
                <span style={styles.coordValue}>
                  {location.latitude.toFixed(4)}° N, {location.longitude.toFixed(4)}° E
                </span>
              ) : (
                <span style={styles.coordValue}>Coordinates not reported</span>
              )}
            </div>

            <div style={styles.coordBox}>
              <span style={styles.infoLabel}>Vessel Speed & Heading</span>
              <span style={styles.infoValue}>
                {location?.speedKnots != null
                  ? `${location.speedKnots} knots`
                  : "Calm / Drifting"}{" "}
                {location?.headingDeg != null ? `(${location.headingDeg}°)` : ""}
              </span>
            </div>

            <div style={styles.coordBox}>
              <span style={styles.infoLabel}>Home Harbour</span>
              <span style={styles.infoValue}>{boat.homePort || "Visakhapatnam Fishing Harbour"}</span>
            </div>
          </div>

          {/* Explicit Freshness Section */}
          <div style={styles.freshnessContainer}>
            <LastUpdatedBadge
              timestamp={location?.timestamp || boat.lastSeen}
              isLive={location?.isLive}
              showExplanation={true}
            />
          </div>

          {/* Quick Action to Trips */}
          <div style={styles.actionStrip}>
            <Link
              href={`/family/boat/${encodeURIComponent(boat.boatId)}/history`}
              style={styles.historyBtn}
            >
              📜 View Full Trip Route & History →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  navRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backLink: {
    fontSize: "0.85rem",
    fontWeight: "700",
    color: "#29434d",
    textDecoration: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  },
  refreshBtn: {
    background: "#ffffff",
    border: "1px solid #cbd5e1",
    borderRadius: "6px",
    padding: "6px 12px",
    fontSize: "0.78rem",
    fontWeight: "600",
    color: "#334155",
    cursor: "pointer",
    boxShadow: "0 1px 3px rgba(0, 0, 0, 0.05)",
  },
  mapCard: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    border: "1px solid #e2e8f0",
    padding: "18px",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.05)",
    display: "flex",
    flexDirection: "column",
    gap: "14px",
  },
  mapHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "10px",
  },
  labelMuted: {
    fontSize: "0.68rem",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: "700",
  },
  pageTitle: {
    margin: "2px 0 0 0",
    fontSize: "1.3rem",
    fontWeight: "800",
    color: "#1e293b",
  },
  statusCluster: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    flexWrap: "wrap",
  },
  statusBadge: {
    fontSize: "0.78rem",
    fontWeight: "800",
    padding: "4px 10px",
    borderRadius: "6px",
    border: "1px solid",
    letterSpacing: "0.03em",
  },
  tripBadge: {
    fontSize: "0.72rem",
    fontWeight: "700",
    padding: "4px 8px",
    borderRadius: "6px",
    backgroundColor: "#e0f2fe",
    color: "#0369a1",
    textTransform: "uppercase",
  },
  infoFooter: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    backgroundColor: "#f8fafc",
    padding: "14px",
    borderRadius: "8px",
    border: "1px solid #f1f5f9",
  },
  coordsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "12px",
  },
  coordBox: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  infoLabel: {
    fontSize: "0.7rem",
    color: "#64748b",
    textTransform: "uppercase",
    fontWeight: "600",
  },
  coordValue: {
    fontSize: "0.95rem",
    fontWeight: "700",
    color: "#0f172a",
    fontFamily: "monospace",
  },
  infoValue: {
    fontSize: "0.85rem",
    fontWeight: "600",
    color: "#334155",
  },
  freshnessContainer: {
    borderTop: "1px solid #e2e8f0",
    paddingTop: "10px",
  },
  actionStrip: {
    display: "flex",
    justifyContent: "flex-end",
    paddingTop: "4px",
  },
  historyBtn: {
    fontSize: "0.8rem",
    fontWeight: "700",
    color: "#0284c7",
    textDecoration: "none",
  },
  centerBox: {
    minHeight: "50vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "30px",
  },
  spinner: {
    width: "36px",
    height: "36px",
    border: "3px solid #cbd5e1",
    borderTopColor: "#29434d",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: "12px",
  },
  loadingText: {
    fontSize: "0.9rem",
    color: "#64748b",
  },
  errorIcon: {
    fontSize: "2.5rem",
    marginBottom: "10px",
  },
  errorTitle: {
    margin: "0 0 8px 0",
    fontSize: "1.2rem",
    fontWeight: "800",
    color: "#1e293b",
  },
  errorDesc: {
    margin: "0 0 16px 0",
    fontSize: "0.85rem",
    color: "#64748b",
  },
  backButton: {
    padding: "8px 16px",
    backgroundColor: "#29434d",
    color: "#ffffff",
    borderRadius: "6px",
    textDecoration: "none",
    fontSize: "0.82rem",
    fontWeight: "600",
  },
};
