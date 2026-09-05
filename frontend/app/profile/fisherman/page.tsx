"use client";

import { useAuth } from "../../../lib/family/authContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function FishermanProfilePage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "FISHERMAN")) {
      router.replace("/profile");
    }
  }, [isLoading, router, user]);

  if (isLoading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
        Loading Vessel Crew Profile...
      </div>
    );
  }

  if (!user || user.role !== "FISHERMAN") {
    return null;
  }

  return (
    <div style={styles.pageWrapper}>
      {/* Top Banner */}
      <div style={styles.topNav}>
        <Link href="/" style={styles.brandLink}>
          <span style={styles.brandIcon}>⚓</span>
          <span style={styles.brandTitle}>JALARI CREW TERMINAL</span>
        </Link>
        <div style={styles.navActions}>
          <Link href="/family" style={styles.secondaryBtn}>
            Family Safety View
          </Link>
          <button onClick={() => logout()} style={styles.logoutBtn}>
            Logout
          </button>
        </div>
      </div>

      <div style={styles.mainContainer}>
        {/* Profile Card */}
        <div style={styles.heroCard}>
          <div style={styles.heroLeft}>
            <div style={styles.avatarCircle}>
              <span>⚓</span>
            </div>
            <div>
              <div style={styles.roleBadge}>VESSEL CREW / SKIPPER</div>
              <h1 style={styles.name}>{user.name || "Captain Rajesh"}</h1>
              <p style={styles.bio}>
                Registered Maritime Fisherman • Home Port: Visakhapatnam Fishing Harbour
              </p>
            </div>
          </div>
          <div style={styles.heroRight}>
            <span style={styles.statusPill}>● ONBOARD CREW ACTIVE</span>
          </div>
        </div>

        {/* Details Grid */}
        <div style={styles.gridSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Skipper &amp; Account Details</h2>
          </div>
          <div style={styles.cardsGrid}>
            <InfoCard label="Full Name" value={user.name || "Captain Rajesh"} icon="👤" />
            <InfoCard label="Email Address" value={user.email} icon="✉️" />
            <InfoCard label="Mobile Phone" value={user.phone || "+91 91234 56780"} icon="📱" />
            <InfoCard label="Fisherman Biometric ID" value="AP-VZG-FSH-8842" icon="🪪" />
          </div>
        </div>

        {/* Assigned Vessel Information */}
        <div style={styles.gridSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Assigned Vessel &amp; Transponder</h2>
          </div>
          <div style={styles.cardsGrid}>
            <InfoCard
              label="Primary Boat ID"
              value={user.assignedBoatIds?.[0] || "AP-07-FISH-12"}
              icon="🚢"
            />
            <InfoCard label="Vessel Name" value="Matsya Ratna" icon="🏷️" />
            <InfoCard label="Marine VHF Radio" value="Channel 16 (Distress) / 68 (Port Ops)" icon="📻" />
            <InfoCard label="LoRa Transponder Unit" value="JALARI-LORA-NODE-01 (Active)" icon="📡" />
          </div>
        </div>

        {/* Safety Checklist */}
        <div style={styles.safetyCard}>
          <h3 style={styles.safetyTitle}>🛡️ Sea Safety Equipment &amp; Checklist</h3>
          <div style={styles.safetyList}>
            <div style={styles.safetyItem}>
              <span style={styles.safetyIcon}>✅</span>
              <span>Life Jackets Inspected: 6 / 6 (SOLAS Grade)</span>
            </div>
            <div style={styles.safetyItem}>
              <span style={styles.safetyIcon}>✅</span>
              <span>EPIRB &amp; LoRa Distress Beacon Battery: 94% Charged</span>
            </div>
            <div style={styles.safetyItem}>
              <span style={styles.safetyIcon}>✅</span>
              <span>Marine First Aid Kit: Verified &amp; Sealed</span>
            </div>
            <div style={styles.safetyItem}>
              <span style={styles.safetyIcon}>✅</span>
              <span>Red Distress Parachute Flares: 4 Units Expiry 2028</span>
            </div>
          </div>
        </div>

        {/* Emergency Contacts */}
        <div style={styles.emergencyCard}>
          <h3 style={styles.emergencyTitle}>🚨 Emergency Maritime Contacts</h3>
          <div style={styles.contactsGrid}>
            <div style={styles.contactBox}>
              <span style={styles.contactLabel}>Indian Coast Guard Distress</span>
              <span style={styles.contactValue}>1554 (Toll-Free VHF / GSM)</span>
            </div>
            <div style={styles.contactBox}>
              <span style={styles.contactLabel}>Coastal Security Police (Visakhapatnam)</span>
              <span style={styles.contactValue}>1093 / 0891-2565555</span>
            </div>
            <div style={styles.contactBox}>
              <span style={styles.contactLabel}>Fisheries Dept Welfare Officer</span>
              <span style={styles.contactValue}>+91 891 278 4455</span>
            </div>
          </div>
        </div>

        {/* Action Bar */}
        <div style={styles.actionBar}>
          <Link href="/family" style={styles.primaryActionBtn}>
            View Fleet Live Safety Map →
          </Link>
          <button onClick={() => logout()} style={styles.logoutActionBtn}>
            Sign Out of Crew Account
          </button>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div style={styles.card}>
      <div style={styles.cardTop}>
        <span style={styles.cardIcon}>{icon}</span>
        <span style={styles.cardLabel}>{label}</span>
      </div>
      <div style={styles.cardValue}>{value}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  pageWrapper: {
    minHeight: "100vh",
    backgroundColor: "#0f172a",
    color: "#f8fafc",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    paddingBottom: 48,
  },
  topNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    background: "rgba(30, 41, 59, 0.8)",
    borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
    backdropFilter: "blur(10px)",
  },
  brandLink: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "#f8fafc",
  },
  brandIcon: {
    fontSize: "1.3rem",
  },
  brandTitle: {
    fontWeight: 800,
    letterSpacing: "0.08em",
    fontSize: "1rem",
    color: "#38bdf8",
  },
  navActions: {
    display: "flex",
    gap: 12,
  },
  secondaryBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    background: "rgba(255, 255, 255, 0.08)",
    color: "#f8fafc",
    border: "1px solid rgba(255, 255, 255, 0.15)",
    textDecoration: "none",
    fontSize: "0.82rem",
    fontWeight: 600,
  },
  logoutBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    background: "#ef4444",
    color: "#ffffff",
    border: "none",
    fontSize: "0.82rem",
    fontWeight: 600,
    cursor: "pointer",
  },
  mainContainer: {
    maxWidth: 960,
    margin: "32px auto 0",
    padding: "0 20px",
    display: "flex",
    flexDirection: "column",
    gap: 24,
  },
  heroCard: {
    background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
    border: "1px solid rgba(56, 189, 248, 0.2)",
    borderRadius: 16,
    padding: "28px 32px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 20,
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.4)",
  },
  heroLeft: {
    display: "flex",
    alignItems: "center",
    gap: 20,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #0284c7 0%, #0369a1 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.8rem",
    boxShadow: "0 4px 12px rgba(2, 132, 199, 0.4)",
  },
  roleBadge: {
    fontSize: "0.72rem",
    fontWeight: 800,
    color: "#38bdf8",
    letterSpacing: "0.1em",
    marginBottom: 4,
  },
  name: {
    margin: "0 0 6px 0",
    fontSize: "1.8rem",
    fontWeight: 800,
  },
  bio: {
    margin: 0,
    fontSize: "0.86rem",
    color: "#94a3b8",
  },
  heroRight: {},
  statusPill: {
    background: "rgba(34, 197, 94, 0.15)",
    border: "1px solid #22c55e",
    color: "#4ade80",
    padding: "6px 14px",
    borderRadius: 20,
    fontSize: "0.75rem",
    fontWeight: 700,
    letterSpacing: "0.05em",
  },
  gridSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  sectionHeader: {},
  sectionTitle: {
    margin: 0,
    fontSize: "1.1rem",
    fontWeight: 700,
    color: "#cbd5e1",
  },
  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  card: {
    background: "#1e293b",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: "16px 18px",
  },
  cardTop: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  cardIcon: {
    fontSize: "1rem",
  },
  cardLabel: {
    fontSize: "0.74rem",
    fontWeight: 700,
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  cardValue: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#f8fafc",
  },
  safetyCard: {
    background: "linear-gradient(135deg, rgba(15, 118, 110, 0.15) 0%, rgba(30, 41, 59, 0.5) 100%)",
    border: "1px solid rgba(20, 184, 166, 0.3)",
    borderRadius: 14,
    padding: "20px 24px",
  },
  safetyTitle: {
    margin: "0 0 14px 0",
    fontSize: "1rem",
    fontWeight: 700,
    color: "#2dd4bf",
  },
  safetyList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 10,
    fontSize: "0.85rem",
    color: "#e2e8f0",
  },
  safetyItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  safetyIcon: {
    fontSize: "0.9rem",
  },
  emergencyCard: {
    background: "rgba(239, 68, 68, 0.08)",
    border: "1px solid rgba(239, 68, 68, 0.25)",
    borderRadius: 14,
    padding: "20px 24px",
  },
  emergencyTitle: {
    margin: "0 0 14px 0",
    fontSize: "1rem",
    fontWeight: 700,
    color: "#f87171",
  },
  contactsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: 12,
  },
  contactBox: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    background: "rgba(0, 0, 0, 0.2)",
    padding: "10px 14px",
    borderRadius: 8,
  },
  contactLabel: {
    fontSize: "0.72rem",
    color: "#94a3b8",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  contactValue: {
    fontSize: "0.9rem",
    fontWeight: 700,
    color: "#ffffff",
  },
  actionBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    flexWrap: "wrap",
    gap: 14,
  },
  primaryActionBtn: {
    padding: "12px 24px",
    borderRadius: 8,
    background: "#0284c7",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "0.9rem",
    textDecoration: "none",
  },
  logoutActionBtn: {
    padding: "12px 20px",
    borderRadius: 8,
    background: "transparent",
    color: "#94a3b8",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
  },
};
