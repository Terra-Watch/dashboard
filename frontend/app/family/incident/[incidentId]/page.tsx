"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { fetchIncidentById, fetchFamilyBoatById } from "../../../../lib/family/familyApi";
import { SOSIncident, FamilyBoat, RescueStatus } from "../../../../lib/family/types";
import { FamilyBoatMap } from "../../../../components/family/FamilyBoatMap";
import { RescueTimeline } from "../../../../components/family/RescueTimeline";
import { useFamilySocket } from "../../../../lib/family/useFamilySocket";

interface PageProps {
  params: Promise<{ incidentId: string }>;
}

export default function IncidentDetailsPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const incidentId = decodeURIComponent(resolvedParams.incidentId);

  const [incident, setIncident] = useState<SOSIncident | null>(null);
  const [boat, setBoat] = useState<FamilyBoat | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const { lastEvent } = useFamilySocket(incident?.boatId);

  const loadIncident = async () => {
    setLoading(true);
    setError(null);
    try {
      const inc = await fetchIncidentById(incidentId);
      if (!inc) {
        setError(`Emergency incident '${incidentId}' not found.`);
      } else {
        setIncident(inc);
        const b = await fetchFamilyBoatById(inc.boatId);
        setBoat(b);
      }
    } catch {
      setError("Unable to load emergency incident details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadIncident();
  }, [incidentId]);

  // Real-time update for rescue status progression
  useEffect(() => {
    if (!lastEvent) return;

    if (
      (lastEvent.type === "sos.acknowledged" ||
        lastEvent.type === "sos.dispatched" ||
        lastEvent.type === "sos.rescued" ||
        lastEvent.type === "sos.resolved") &&
      lastEvent.incidentId === incidentId
    ) {
      setIncident((prev) => {
        if (!prev) return prev;
        const newStatus = lastEvent.status as RescueStatus;
        let newLabel = prev.statusLabel;
        if (newStatus === "ACKNOWLEDGED") newLabel = "Rescue team notified";
        if (newStatus === "DISPATCHED") newLabel = "Rescue team dispatched";
        if (newStatus === "RESCUED") newLabel = "Fishermen safely rescued";
        if (newStatus === "RESOLVED") newLabel = "Incident resolved";

        return {
          ...prev,
          status: newStatus,
          statusLabel: newLabel,
          updatedAt: lastEvent.timestamp,
          acknowledgedAt:
            newStatus === "ACKNOWLEDGED" ? lastEvent.timestamp : prev.acknowledgedAt,
          dispatchedAt:
            newStatus === "DISPATCHED" ? lastEvent.timestamp : prev.dispatchedAt,
          rescuedAt:
            newStatus === "RESCUED" ? lastEvent.timestamp : prev.rescuedAt,
          resolvedAt:
            newStatus === "RESOLVED" ? lastEvent.timestamp : prev.resolvedAt,
        };
      });
    }
  }, [lastEvent, incidentId]);

  if (loading) {
    return (
      <div style={styles.centerBox}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Loading emergency rescue feed...</p>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div style={styles.centerBox}>
        <div style={styles.errorIcon}>⚠️</div>
        <h2 style={styles.errorTitle}>Incident Not Found</h2>
        <p style={styles.errorDesc}>{error || "Emergency incident could not be retrieved."}</p>
        <Link href="/family" style={styles.backButton}>
          ← Return to Family Home
        </Link>
      </div>
    );
  }

  const isResolved = incident.status === "RESOLVED";

  return (
    <div style={styles.container}>
      {/* Top Bar */}
      <div style={styles.topNav}>
        <Link href="/family" style={styles.backLink}>
          ← Back to Family Home
        </Link>
        <span style={styles.incidentTag}>INCIDENT #{incident.id}</span>
      </div>

      {/* Hero Alert Banner */}
      <div
        style={{
          ...styles.heroAlert,
          backgroundColor: isResolved ? "#14532d" : "#7f1d1d",
          borderColor: isResolved ? "#22c55e" : "#ef4444",
        }}
      >
        <div style={styles.heroLeft}>
          <span style={styles.heroIcon}>{isResolved ? "RESOLVED" : "SOS"}</span>
          <div>
            <h1 style={styles.heroTitle}>
              {isResolved ? "EMERGENCY RESOLVED" : "ACTIVE DISTRESS INCIDENT"}
            </h1>
            <p style={styles.heroSubtitle}>
              {isResolved
                ? `Vessel ${incident.boatName} (${incident.boatId}) has been secured safely.`
                : `Your boat ${incident.boatName} (${incident.boatId}) has triggered an emergency beacon.`}
            </p>
          </div>
        </div>

        <div style={styles.heroBadge}>
          <span style={styles.badgeLabel}>CURRENT RESCUE STATUS</span>
          <span style={styles.badgeValue}>{incident.statusLabel}</span>
        </div>
      </div>

      {/* Main Grid: Details + Map + Stepper */}
      <div style={styles.grid}>
        {/* Left Column: Essential Incident Information */}
        <div style={styles.leftCol}>
          {/* Quick Metrics Card */}
          <div style={styles.metricCard}>
            <h2 style={styles.cardTitle}>Incident Overview</h2>

            <div style={styles.infoRow}>
              <span style={styles.fieldLabel}>Affected Vessel:</span>
              <span style={styles.fieldValue}>
                <strong>{incident.boatName}</strong> ({incident.boatId})
              </span>
            </div>

            <div style={styles.infoRow}>
              <span style={styles.fieldLabel}>SOS Trigger Time:</span>
              <span style={styles.fieldValue}>
                {new Date(incident.timestamp).toLocaleString()}
              </span>
            </div>

            <div style={styles.infoRow}>
              <span style={styles.fieldLabel}>Last Known Coordinates:</span>
              <span style={styles.coordValue}>
                {incident.location.latitude.toFixed(4)}° N,{" "}
                {incident.location.longitude.toFixed(4)}° E
              </span>
            </div>

            {incident.details && (
              <div style={styles.detailsBlock}>
                <span style={styles.fieldLabel}>Reported Condition:</span>
                <p style={styles.detailsText}>{incident.details}</p>
              </div>
            )}
          </div>

          {/* Rescue Timeline Stepper */}
          <RescueTimeline
            currentStatus={incident.status}
            acknowledgedAt={incident.acknowledgedAt}
            dispatchedAt={incident.dispatchedAt}
            rescuedAt={incident.rescuedAt}
            resolvedAt={incident.resolvedAt}
          />

          {/* Contact information returned with the incident */}
          <div style={styles.contactsCard}>
            <h3 style={styles.contactTitle}>Incident contact</h3>
            <p style={styles.contactNotice}>
              Use the contact details supplied by the rescue service for this incident.
            </p>
            {incident.rescueContact ? <a href={`tel:${incident.rescueContact.replace(/[^\d+]/g, "")}`} style={styles.phoneLink}>{incident.rescueContact}</a> : <span style={styles.phoneSub}>No incident contact was provided.</span>}
          </div>
        </div>

        {/* Right Column: Emergency Location Map */}
        <div style={styles.rightCol}>
          <div style={styles.mapContainer}>
            <div style={styles.mapTitleRow}>
              <div>
                <span style={styles.labelMuted}>INCIDENT RADAR</span>
                <h3 style={styles.mapHeading}>Last Reported Location at SOS</h3>
              </div>
              <span style={styles.emergencyTag}>Beacon Fix</span>
            </div>

            <FamilyBoatMap
              boatId={incident.boatId}
              boatName={incident.boatName}
              location={incident.location}
              status="EMERGENCY"
              height="480px"
            />

            <div style={styles.mapFootnote}>
              <span>
                Coordinates locked at time of SOS beacon activation. SAR search grid is centered at this point.
              </span>
            </div>
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
    gap: "18px",
  },
  topNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  backLink: {
    fontSize: "0.85rem",
    fontWeight: "700",
    color: "#29434d",
    textDecoration: "none",
  },
  incidentTag: {
    fontSize: "0.75rem",
    color: "#64748b",
    fontWeight: "700",
    backgroundColor: "#e2e8f0",
    padding: "3px 8px",
    borderRadius: "4px",
  },
  heroAlert: {
    borderRadius: "12px",
    border: "2px solid",
    color: "#ffffff",
    padding: "20px 24px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "16px",
    boxShadow: "0 6px 20px rgba(0, 0, 0, 0.2)",
  },
  heroLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  heroIcon: {
    fontSize: "2.4rem",
  },
  heroTitle: {
    margin: 0,
    fontSize: "1.35rem",
    fontWeight: "800",
    letterSpacing: "0.04em",
  },
  heroSubtitle: {
    margin: "4px 0 0 0",
    fontSize: "0.88rem",
    color: "#fecaca",
    lineHeight: "1.4",
  },
  heroBadge: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    padding: "8px 14px",
    borderRadius: "8px",
  },
  badgeLabel: {
    fontSize: "0.68rem",
    letterSpacing: "0.06em",
    fontWeight: "700",
    color: "#fca5a5",
  },
  badgeValue: {
    fontSize: "1.05rem",
    fontWeight: "800",
    color: "#ffffff",
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: "20px",
  },
  leftCol: {
    display: "flex",
    flexDirection: "column",
    gap: "16px",
  },
  rightCol: {
    display: "flex",
    flexDirection: "column",
  },
  metricCard: {
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  cardTitle: {
    margin: "0 0 4px 0",
    fontSize: "1rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #f1f5f9",
    paddingBottom: "8px",
    fontSize: "0.85rem",
    flexWrap: "wrap",
    gap: "6px",
  },
  fieldLabel: {
    color: "#64748b",
  },
  fieldValue: {
    color: "#1e293b",
  },
  coordValue: {
    color: "#991b1b",
    fontWeight: "700",
    fontFamily: "monospace",
    fontSize: "0.92rem",
  },
  detailsBlock: {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    paddingTop: "4px",
  },
  detailsText: {
    margin: 0,
    fontSize: "0.82rem",
    color: "#334155",
    backgroundColor: "#f8fafc",
    padding: "10px",
    borderRadius: "6px",
    border: "1px solid #e2e8f0",
    lineHeight: "1.4",
  },
  contactsCard: {
    backgroundColor: "#f8fafc",
    borderRadius: "10px",
    border: "1px solid #cbd5e1",
    padding: "18px",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },
  contactTitle: {
    margin: 0,
    fontSize: "0.92rem",
    fontWeight: "700",
    color: "#1e293b",
  },
  contactNotice: {
    margin: 0,
    fontSize: "0.78rem",
    color: "#64748b",
  },
  contactList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  contactItem: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  contactOrg: {
    fontSize: "0.75rem",
    fontWeight: "700",
    color: "#334155",
  },
  phoneLink: {
    fontSize: "0.92rem",
    fontWeight: "800",
    color: "#0369a1",
    textDecoration: "none",
  },
  phoneSub: {
    fontSize: "0.72rem",
    color: "#64748b",
  },
  mapContainer: {
    backgroundColor: "#ffffff",
    borderRadius: "10px",
    border: "1px solid #e2e8f0",
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  mapTitleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  labelMuted: {
    fontSize: "0.68rem",
    color: "#64748b",
    textTransform: "uppercase",
    fontWeight: "700",
    letterSpacing: "0.05em",
  },
  mapHeading: {
    margin: "2px 0 0 0",
    fontSize: "1.05rem",
    fontWeight: "800",
    color: "#1e293b",
  },
  emergencyTag: {
    backgroundColor: "#fee2e2",
    color: "#b91c1c",
    padding: "3px 8px",
    borderRadius: "4px",
    fontSize: "0.72rem",
    fontWeight: "700",
    textTransform: "uppercase",
  },
  mapFootnote: {
    fontSize: "0.74rem",
    color: "#64748b",
    lineHeight: "1.35",
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
