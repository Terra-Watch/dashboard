"use client";

import React, { useEffect, useState, use } from "react";
import Link from "next/link";
import { fetchFamilyBoatById, fetchBoatTrips } from "../../../../../lib/family/familyApi";
import { FamilyBoat, FamilyTrip } from "../../../../../lib/family/types";
import { TripCard } from "../../../../../components/family/TripCard";

interface PageProps {
  params: Promise<{ boatId: string }>;
}

export default function TripHistoryPage({ params }: PageProps) {
  const resolvedParams = use(params);
  const boatId = decodeURIComponent(resolvedParams.boatId);

  const [boat, setBoat] = useState<FamilyBoat | null>(null);
  const [trips, setTrips] = useState<FamilyTrip[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setError(null);
      try {
        const boatData = await fetchFamilyBoatById(boatId);
        if (!boatData) {
          setError(`Vessel '${boatId}' not found.`);
        } else {
          setBoat(boatData);
          const tripList = await fetchBoatTrips(boatId);
          setTrips(tripList);
        }
      } catch {
        setError("Unable to load trip records from harbour database.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, [boatId]);

  if (loading) {
    return (
      <div style={styles.centerBox}>
        <div style={styles.spinner} />
        <p style={styles.loadingText}>Retrieving voyage logs for {boatId}...</p>
      </div>
    );
  }

  if (error || !boat) {
    return (
      <div style={styles.centerBox}>
        <div style={styles.errorIcon}>⚠️</div>
        <h2 style={styles.errorTitle}>Voyage Records Unavailable</h2>
        <p style={styles.errorDesc}>{error || "Trip logs could not be retrieved."}</p>
        <Link href="/family" style={styles.backButton}>
          ← Return to Family Home
        </Link>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Navigation & Header */}
      <div style={styles.header}>
        <div style={styles.navRow}>
          <Link href={`/family/boat/${encodeURIComponent(boat.boatId)}`} style={styles.backLink}>
            ← Vessel Location ({boat.name})
          </Link>
          <span style={styles.harbourTag}>Port: {boat.homePort || "Visakhapatnam Fishing Harbour"}</span>
        </div>

        <div style={styles.titleRow}>
          <div>
            <span style={styles.subhead}>FISHING VOYAGE LOGS</span>
            <h1 style={styles.title}>Trip History — {boat.name}</h1>
          </div>
          <div style={styles.badgeGroup}>
            <span style={styles.boatBadge}>{boat.boatId}</span>
            <span style={styles.tripCount}>{trips.length} Voyages Recorded</span>
          </div>
        </div>
      </div>

      {/* Trip List */}
      {trips.length === 0 ? (
        <div style={styles.emptyCard}>
          <p style={styles.emptyText}>
            No past fishing trips have been recorded yet for this vessel.
          </p>
        </div>
      ) : (
        <div style={styles.tripsList}>
          {trips.map((trip) => (
            <TripCard key={trip.id} trip={trip} boatName={boat.name} />
          ))}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: "flex",
    flexDirection: "column",
    gap: "18px",
  },
  header: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
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
  },
  harbourTag: {
    fontSize: "0.75rem",
    color: "#64748b",
  },
  titleRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-end",
    flexWrap: "wrap",
    gap: "10px",
  },
  subhead: {
    fontSize: "0.68rem",
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  title: {
    margin: "2px 0 0 0",
    fontSize: "1.35rem",
    fontWeight: "800",
    color: "#1e293b",
  },
  badgeGroup: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  boatBadge: {
    fontSize: "0.78rem",
    fontWeight: "700",
    backgroundColor: "#e2e8f0",
    color: "#1e293b",
    padding: "3px 8px",
    borderRadius: "4px",
  },
  tripCount: {
    fontSize: "0.75rem",
    color: "#0369a1",
    fontWeight: "600",
  },
  tripsList: {
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },
  emptyCard: {
    backgroundColor: "#ffffff",
    border: "1px dashed #cbd5e1",
    borderRadius: "10px",
    padding: "36px",
    textAlign: "center",
  },
  emptyText: {
    margin: 0,
    fontSize: "0.88rem",
    color: "#64748b",
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
