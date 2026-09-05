"use client";

import React, { useEffect, useState } from "react";
import { useAuth } from "../../lib/family/authContext";
import { fetchFamilyBoats } from "../../lib/family/familyApi";
import { FamilyBoat } from "../../lib/family/types";
import { BoatStatusCard } from "../../components/family/BoatStatusCard";
import { useFamilySocket } from "../../lib/family/useFamilySocket";

export default function FamilyHomePage() {
  const { user } = useAuth();
  const [boats, setBoats] = useState<FamilyBoat[]>([]);
  const [selectedBoatId, setSelectedBoatId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { lastEvent } = useFamilySocket();

  const loadBoats = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFamilyBoats();
      setBoats(data);
      if (data.length > 0 && !selectedBoatId) {
        setSelectedBoatId(data[0].boatId);
      }
    } catch (err: any) {
      setError("Unable to update vessel safety data. Current status is unavailable.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBoats();
  }, []);

  // Update boat in real-time when WebSocket event arrives
  useEffect(() => {
    if (!lastEvent) return;

    if (lastEvent.type === "boat.location.updated") {
      setBoats((prev) =>
        prev.map((b) => {
          if (b.boatId.toLowerCase() === lastEvent.boatId.toLowerCase()) {
            return {
              ...b,
              latestLocation: {
                latitude: lastEvent.latitude,
                longitude: lastEvent.longitude,
                timestamp: lastEvent.timestamp,
                isLive: true,
                speedKnots: lastEvent.speedKnots,
                headingDeg: lastEvent.headingDeg,
              },
              lastSeen: lastEvent.timestamp,
              connectionStatus: "CONNECTED",
            };
          }
          return b;
        })
      );
    } else if (lastEvent.type === "boat.status.updated") {
      setBoats((prev) =>
        prev.map((b) => {
          if (b.boatId.toLowerCase() === lastEvent.boatId.toLowerCase()) {
            return {
              ...b,
              safetyStatus: lastEvent.status,
              tripState: lastEvent.tripState || b.tripState,
            };
          }
          return b;
        })
      );
    } else if (lastEvent.type === "sos.created") {
      setBoats((prev) =>
        prev.map((b) => {
          if (b.boatId.toLowerCase() === lastEvent.boatId.toLowerCase()) {
            return {
              ...b,
              safetyStatus: "EMERGENCY",
              activeIncidentId: lastEvent.incidentId,
            };
          }
          return b;
        })
      );
    } else if (lastEvent.type === "sos.resolved") {
      setBoats((prev) =>
        prev.map((b) => {
          if (b.boatId.toLowerCase() === lastEvent.boatId.toLowerCase()) {
            return {
              ...b,
              safetyStatus: "SAFE",
              activeIncidentId: null,
            };
          }
          return b;
        })
      );
    }
  }, [lastEvent]);

  if (loading && boats.length === 0) {
    return (
      <div style={styles.stateCenter}>
        <div style={styles.spinner} />
        <h2 style={styles.loadingTitle}>Connecting to family vessel...</h2>
        <p style={styles.stateSub}>Fetching latest safety updates from shore gateway</p>
      </div>
    );
  }

  if (error && boats.length === 0 && !loading) {
    return (
      <div style={styles.stateCenter} role="alert">
        <h2 style={styles.emptyTitle}>Safety data unavailable</h2>
        <p style={styles.stateSub}>{error}</p>
        <button type="button" onClick={loadBoats}>Retry</button>
      </div>
    );
  }

  if (boats.length === 0 && !loading) {
    return (
      <div style={styles.stateCenter}>
        <div style={styles.emptyIcon}>⚓</div>
        <h2 style={styles.emptyTitle}>No Boat Assigned</h2>
        <p style={styles.stateSub}>
          There are currently no fishing vessels assigned to your family account (
          <strong>{user?.phone || user?.email}</strong>).
        </p>
        <p style={styles.stateNote}>
          Please contact your harbour registration desk or fisheries officer to link your vessel RFID/Node ID.
        </p>
      </div>
    );
  }

  const primaryBoat =
    boats.find((b) => b.boatId === selectedBoatId) || boats[0];
  const secondaryBoats = boats.filter((b) => b.boatId !== primaryBoat.boatId);

  return (
    <div style={styles.container}>
      {/* Welcome Banner */}
      <div style={styles.welcomeRow}>
        <div>
          <h1 style={styles.greeting}>
            Namaskaram, {user?.name || "Family Member"}
          </h1>
          <p style={styles.greetingSub}>
            Here is the current safety and location status of your family at sea.
          </p>
        </div>

        {/* Vessel Switcher (if family has >1 boat registered) */}
        {boats.length > 1 && (
          <div style={styles.switcher}>
            <span style={styles.switcherLabel}>Selected Boat:</span>
            <div style={styles.switcherTabs}>
              {boats.map((b) => (
                <button
                  key={b.boatId}
                  onClick={() => setSelectedBoatId(b.boatId)}
                  style={{
                    ...styles.tabBtn,
                    backgroundColor:
                      b.boatId === primaryBoat.boatId ? "#29434d" : "#ffffff",
                    color:
                      b.boatId === primaryBoat.boatId ? "#ffffff" : "#475569",
                    borderColor:
                      b.boatId === primaryBoat.boatId ? "#29434d" : "#cbd5e1",
                  }}
                >
                  {b.name} ({b.boatId})
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {error && (
        <div style={styles.warningNotice}>
          <span>⚠️ {error}</span>
        </div>
      )}

      {/* Main Focus: Primary Boat Status Card */}
      <div style={styles.primarySection}>
        <BoatStatusCard boat={primaryBoat} isPrimary={true} />
      </div>

      {/* If family owns other vessels, list them */}
      {secondaryBoats.length > 0 && (
        <div style={styles.secondarySection}>
          <h3 style={styles.sectionHeader}>Other Registered Vessels</h3>
          <div style={styles.secondaryGrid}>
            {secondaryBoats.map((b) => (
              <BoatStatusCard key={b.boatId} boat={b} isPrimary={false} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "20px",
  },
  welcomeRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: "14px",
  },
  greeting: {
    margin: 0,
    fontSize: "1.45rem",
    fontWeight: "800",
    color: "#1e293b",
    letterSpacing: "-0.01em",
  },
  greetingSub: {
    margin: "4px 0 0 0",
    fontSize: "0.85rem",
    color: "#64748b",
  },
  switcher: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
    alignItems: "flex-end",
  },
  switcherLabel: {
    fontSize: "0.72rem",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    fontWeight: "600",
  },
  switcherTabs: {
    display: "flex",
    gap: "6px",
  },
  tabBtn: {
    padding: "6px 12px",
    fontSize: "0.78rem",
    fontWeight: "600",
    borderRadius: "6px",
    border: "1px solid",
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  warningNotice: {
    backgroundColor: "#fffbeb",
    border: "1px solid #fef3c7",
    color: "#92400e",
    borderRadius: "8px",
    padding: "10px 14px",
    fontSize: "0.82rem",
  },
  primarySection: {
    display: "flex",
    flexDirection: "column",
  },
  secondarySection: {
    marginTop: "12px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  sectionHeader: {
    margin: 0,
    fontSize: "1.05rem",
    fontWeight: "700",
    color: "#334155",
  },
  secondaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: "16px",
  },
  stateCenter: {
    minHeight: "50vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: "40px 20px",
  },
  spinner: {
    width: "40px",
    height: "40px",
    border: "3px solid #cbd5e1",
    borderTopColor: "#29434d",
    borderRadius: "50%",
    animation: "spin 1s linear infinite",
    marginBottom: "16px",
  },
  loadingTitle: {
    margin: 0,
    fontSize: "1.2rem",
    color: "#1e293b",
    fontWeight: "700",
  },
  emptyIcon: {
    fontSize: "3rem",
    marginBottom: "12px",
  },
  emptyTitle: {
    margin: "0 0 8px 0",
    fontSize: "1.3rem",
    fontWeight: "800",
    color: "#1e293b",
  },
  stateSub: {
    margin: "0 0 10px 0",
    fontSize: "0.88rem",
    color: "#64748b",
    maxWidth: "400px",
    lineHeight: "1.4",
  },
  stateNote: {
    margin: 0,
    fontSize: "0.78rem",
    color: "#94a3b8",
    maxWidth: "380px",
  },
};
