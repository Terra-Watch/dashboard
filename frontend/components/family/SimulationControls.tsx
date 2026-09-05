"use client";

import React, { useState } from "react";
import { familyBus } from "../../lib/family/useFamilySocket";
import { localStore } from "../../lib/family/familyApi";

interface SimulationControlsProps {
  boatId?: string;
}

export function SimulationControls({ boatId = "AP-07-FISH-12" }: SimulationControlsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState<number>(0);
  const [activeIncidentId, setActiveIncidentId] = useState<string>("INC-SIM-" + Date.now().toString().slice(-4));

  // 1. Simulate Location Movement
  const handlePushLocation = () => {
    const boat = localStore.getBoat(boatId);
    const currentLat = boat?.latestLocation?.latitude || 17.7125;
    const currentLng = boat?.latestLocation?.longitude || 83.3340;

    // Move slightly southeast towards fishing ground
    const newLat = +(currentLat + (Math.random() * 0.006 - 0.002)).toFixed(4);
    const newLng = +(currentLng + (Math.random() * 0.008 - 0.002)).toFixed(4);

    familyBus.dispatch({
      type: "boat.location.updated",
      boatId,
      latitude: newLat,
      longitude: newLng,
      timestamp: new Date().toISOString(),
      speedKnots: +(5 + Math.random() * 3).toFixed(1),
      headingDeg: Math.floor(Math.random() * 360),
    });
  };

  // 2. Trigger SOS
  const handleTriggerSOS = () => {
    const newIncId = "INC-SIM-" + Date.now().toString().slice(-4);
    setActiveIncidentId(newIncId);
    setStep(1);

    const boat = localStore.getBoat(boatId);
    const lat = boat?.latestLocation?.latitude || 17.7125;
    const lng = boat?.latestLocation?.longitude || 83.3340;

    familyBus.dispatch({
      type: "sos.created",
      incidentId: newIncId,
      boatId,
      latitude: lat,
      longitude: lng,
      timestamp: new Date().toISOString(),
      status: "ACTIVE",
      details: "Simulated distress call: Mechanical steering failure in choppy seas.",
    });

    familyBus.dispatch({
      type: "boat.status.updated",
      boatId,
      status: "EMERGENCY",
      timestamp: new Date().toISOString(),
    });
  };

  // 3. Advance Rescue Lifecycle: Acknowledged -> Dispatched -> Rescued -> Resolved
  const handleAdvanceRescue = (nextStatus: "ACKNOWLEDGED" | "DISPATCHED" | "RESCUED" | "RESOLVED") => {
    if (nextStatus === "ACKNOWLEDGED") {
      familyBus.dispatch({
        type: "sos.acknowledged",
        incidentId: activeIncidentId,
        boatId,
        timestamp: new Date().toISOString(),
        status: "ACKNOWLEDGED",
      });
      setStep(2);
    } else if (nextStatus === "DISPATCHED") {
      familyBus.dispatch({
        type: "sos.dispatched",
        incidentId: activeIncidentId,
        boatId,
        timestamp: new Date().toISOString(),
        status: "DISPATCHED",
      });
      setStep(3);
    } else if (nextStatus === "RESCUED") {
      familyBus.dispatch({
        type: "sos.rescued",
        incidentId: activeIncidentId,
        boatId,
        timestamp: new Date().toISOString(),
        status: "RESCUED",
      });
      setStep(4);
    } else if (nextStatus === "RESOLVED") {
      familyBus.dispatch({
        type: "sos.resolved",
        incidentId: activeIncidentId,
        boatId,
        timestamp: new Date().toISOString(),
        status: "RESOLVED",
      });

      familyBus.dispatch({
        type: "boat.status.updated",
        boatId,
        status: "SAFE",
        timestamp: new Date().toISOString(),
      });
      setStep(0);
    }
  };

  // 4. Simulate Connection Loss (Old timestamp)
  const handleSimulateConnectionLoss = () => {
    const boat = localStore.getBoat(boatId);
    if (!boat || !boat.latestLocation) return;

    // Set timestamp to 25 minutes ago
    const oldTimestamp = new Date(Date.now() - 25 * 60 * 1000).toISOString();
    localStore.updateBoatLocation(boatId, {
      ...boat.latestLocation,
      timestamp: oldTimestamp,
      isLive: false,
    });
    boat.connectionStatus = "NO_RECENT_UPDATE";

    familyBus.dispatch({
      type: "boat.location.updated",
      boatId,
      latitude: boat.latestLocation.latitude,
      longitude: boat.latestLocation.longitude,
      timestamp: oldTimestamp,
    });
  };

  return (
    <div style={styles.dock}>
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          style={styles.launcherBtn}
          title="Open Evaluation Simulator"
        >
          ⚙️ Demo Simulator
        </button>
      ) : (
        <div style={styles.panel}>
          <div style={styles.header}>
            <span style={styles.headerTitle}>Member 5 Live Evaluator</span>
            <button
              onClick={() => setIsOpen(false)}
              style={styles.closeBtn}
              aria-label="Close"
            >
              ✕
            </button>
          </div>
          <p style={styles.desc}>
            Test real-time WebSocket events and the rescue workflow for <strong>{boatId}</strong>:
          </p>

          <div style={styles.btnGrid}>
            <button
              onClick={handlePushLocation}
              style={{ ...styles.actionBtn, background: "#0284c7" }}
            >
              🛰️ Move Boat (Live GPS)
            </button>

            <button
              onClick={handleSimulateConnectionLoss}
              style={{ ...styles.actionBtn, background: "#d97706" }}
            >
              ⏳ Simulate Signal Loss (25m old)
            </button>

            <div style={styles.divider} />

            <div style={styles.sosSection}>
              <span style={styles.sectionLabel}>SOS Rescue Workflow:</span>
              <button
                onClick={handleTriggerSOS}
                style={{ ...styles.actionBtn, background: "#dc2626" }}
              >
                🚨 1. Trigger SOS Alert
              </button>

              <div style={styles.rescueStages}>
                <button
                  onClick={() => handleAdvanceRescue("ACKNOWLEDGED")}
                  style={styles.stageBtn}
                  disabled={step < 1}
                >
                  2. Acknowledge
                </button>
                <button
                  onClick={() => handleAdvanceRescue("DISPATCHED")}
                  style={styles.stageBtn}
                  disabled={step < 2}
                >
                  3. Dispatch
                </button>
                <button
                  onClick={() => handleAdvanceRescue("RESCUED")}
                  style={styles.stageBtn}
                  disabled={step < 3}
                >
                  4. Rescued
                </button>
                <button
                  onClick={() => handleAdvanceRescue("RESOLVED")}
                  style={{ ...styles.stageBtn, color: "#16a34a" }}
                  disabled={step < 1}
                >
                  5. Resolve
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  dock: {
    position: "fixed",
    bottom: "16px",
    right: "16px",
    zIndex: 9999,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  launcherBtn: {
    background: "#29434d",
    color: "#f8fafc",
    border: "1px solid rgba(255, 255, 255, 0.25)",
    padding: "8px 14px",
    borderRadius: "20px",
    fontSize: "0.8rem",
    fontWeight: "700",
    cursor: "pointer",
    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.25)",
  },
  panel: {
    width: "320px",
    background: "#1e293b",
    color: "#f8fafc",
    borderRadius: "10px",
    padding: "14px",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
    border: "1px solid #334155",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "8px",
  },
  headerTitle: {
    fontSize: "0.82rem",
    fontWeight: "800",
    color: "#38bdf8",
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  closeBtn: {
    background: "transparent",
    border: "none",
    color: "#94a3b8",
    fontSize: "0.9rem",
    cursor: "pointer",
    padding: "2px 6px",
  },
  desc: {
    fontSize: "0.72rem",
    color: "#94a3b8",
    margin: "0 0 10px 0",
    lineHeight: "1.3",
  },
  btnGrid: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  actionBtn: {
    border: "none",
    color: "#ffffff",
    padding: "7px 10px",
    borderRadius: "6px",
    fontSize: "0.76rem",
    fontWeight: "700",
    cursor: "pointer",
    textAlign: "left",
    transition: "opacity 0.15s ease",
  },
  divider: {
    height: "1px",
    background: "#334155",
    margin: "4px 0",
  },
  sosSection: {
    display: "flex",
    flexDirection: "column",
    gap: "6px",
  },
  sectionLabel: {
    fontSize: "0.7rem",
    color: "#cbd5e1",
    fontWeight: "600",
  },
  rescueStages: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr 1fr",
    gap: "4px",
  },
  stageBtn: {
    background: "#0f172a",
    border: "1px solid #475569",
    color: "#f1f5f9",
    padding: "5px 4px",
    borderRadius: "4px",
    fontSize: "0.68rem",
    fontWeight: "600",
    cursor: "pointer",
  },
};
