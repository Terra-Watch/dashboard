"use client";

import { useAuth } from "../../../lib/family/authContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function FamilyProfilePage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "FAMILY")) {
      router.replace("/profile");
    }
  }, [isLoading, router, user]);

  if (isLoading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
        Loading Family Profile...
      </div>
    );
  }

  if (!user || user.role !== "FAMILY") {
    return null;
  }

  return (
    <div style={styles.pageWrapper}>
      {/* Top Navigation */}
      <div style={styles.topNav}>
        <Link href="/family" style={styles.brandLink}>
          <span style={styles.brandIcon}>🌊</span>
          <span style={styles.brandTitle}>JALARI FAMILY PORTAL</span>
        </Link>
        <div style={styles.navActions}>
          <Link href="/family" style={styles.secondaryBtn}>
            ← Back to Vessel Safety Tracker
          </Link>
          <button onClick={() => logout()} style={styles.logoutBtn}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={styles.mainContainer}>
        {/* Profile Hero Card */}
        <div style={styles.heroCard}>
          <div style={styles.heroLeft}>
            <div style={styles.avatarCircle}>
              <span>🏠</span>
            </div>
            <div>
              <div style={styles.roleBadge}>FAMILY SAFETY ACCOUNT</div>
              <h1 style={styles.name}>{user.name || "Lakshmi Rao"}</h1>
              <p style={styles.bio}>
                Shore-side Family Contact • Monitoring Coastal Fleet Safety
              </p>
            </div>
          </div>
          <div style={styles.heroRight}>
            <span style={styles.statusPill}>● EMERGENCY ALERTS ACTIVE</span>
          </div>
        </div>

        {/* Contact & Personal Information */}
        <div style={styles.gridSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Account Information</h2>
          </div>
          <div style={styles.cardsGrid}>
            <InfoCard label="Contact Name" value={user.name || "Lakshmi Rao"} icon="👤" />
            <InfoCard label="Registered Email" value={user.email} icon="✉️" />
            <InfoCard label="Emergency Mobile" value={user.phone || "+91 98480 22334"} icon="📱" />
            <InfoCard label="Home Fishing Harbour" value="Visakhapatnam Inner Harbour" icon="⚓" />
          </div>
        </div>

        {/* Monitored Vessels */}
        <div style={styles.vesselsCard}>
          <div style={styles.vesselsHeader}>
            <h3 style={styles.vesselsTitle}>🚢 Monitored Vessel Fleet</h3>
            <span style={styles.vesselCountBadge}>
              {user.assignedBoatIds?.length || 1} Registered Boat
            </span>
          </div>
          <div style={styles.vesselsList}>
            {(user.assignedBoatIds?.length ? user.assignedBoatIds : ["AP-07-FISH-12"]).map((boatId) => (
              <div key={boatId} style={styles.vesselItem}>
                <div style={styles.vesselInfo}>
                  <div style={styles.vesselName}>Matsya Ratna ({boatId})</div>
                  <div style={styles.vesselMeta}>
                    Status: <strong style={{ color: "#16a34a" }}>SAFE AT SEA</strong> • Last Ping: 2m ago via LoRa Gateway
                  </div>
                </div>
                <Link href={`/family/boat/${boatId}`} style={styles.trackBoatBtn}>
                  View Live Map →
                </Link>
              </div>
            ))}
          </div>
        </div>

        {/* Emergency Alert Settings */}
        <div style={styles.settingsCard}>
          <h3 style={styles.settingsTitle}>🔔 Emergency Notification Preferences</h3>
          <div style={styles.settingsGrid}>
            <div style={styles.settingItem}>
              <div>
                <strong style={styles.settingName}>Instant SMS SOS Alerts</strong>
                <p style={styles.settingDesc}>Immediate SMS if your boat triggers the emergency distress button.</p>
              </div>
              <span style={styles.enabledBadge}>ENABLED</span>
            </div>
            <div style={styles.settingItem}>
              <div>
                <strong style={styles.settingName}>WhatsApp Weather Warnings</strong>
                <p style={styles.settingDesc}>IMD cyclone, high swell, and maritime safety advisories.</p>
              </div>
              <span style={styles.enabledBadge}>ENABLED</span>
            </div>
            <div style={styles.settingItem}>
              <div>
                <strong style={styles.settingName}>Harbour Geofence Notifications</strong>
                <p style={styles.settingDesc}>Notifications when your vessel leaves port or returns safely.</p>
              </div>
              <span style={styles.enabledBadge}>ENABLED</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div style={styles.actionBar}>
          <Link href="/family" style={styles.primaryActionBtn}>
            Open Live Vessel Safety Map →
          </Link>
          <button onClick={() => logout()} style={styles.logoutActionBtn}>
            Sign Out of Family Account
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
    backgroundColor: "#f8fafc",
    color: "#0f172a",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    paddingBottom: 48,
  },
  topNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    background: "#29434d",
    color: "#ffffff",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
  },
  brandLink: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    textDecoration: "none",
    color: "#ffffff",
  },
  brandIcon: {
    fontSize: "1.2rem",
  },
  brandTitle: {
    fontWeight: 800,
    letterSpacing: "0.08em",
    fontSize: "0.95rem",
  },
  navActions: {
    display: "flex",
    gap: 12,
  },
  secondaryBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    background: "rgba(255, 255, 255, 0.12)",
    color: "#ffffff",
    border: "1px solid rgba(255, 255, 255, 0.2)",
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
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: "28px 32px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 20,
    boxShadow: "0 10px 25px rgba(15, 23, 42, 0.05)",
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
    background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.8rem",
    color: "#ffffff",
    boxShadow: "0 4px 12px rgba(15, 118, 110, 0.3)",
  },
  roleBadge: {
    fontSize: "0.72rem",
    fontWeight: 800,
    color: "#0f766e",
    letterSpacing: "0.1em",
    marginBottom: 4,
  },
  name: {
    margin: "0 0 6px 0",
    fontSize: "1.8rem",
    fontWeight: 800,
    color: "#0f172a",
  },
  bio: {
    margin: 0,
    fontSize: "0.86rem",
    color: "#64748b",
  },
  heroRight: {},
  statusPill: {
    background: "#f0fdf4",
    border: "1px solid #86efac",
    color: "#15803d",
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
    color: "#334155",
  },
  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  card: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 12,
    padding: "16px 18px",
    boxShadow: "0 2px 6px rgba(0,0,0,0.02)",
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
    color: "#64748b",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  cardValue: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#0f172a",
  },
  vesselsCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: "22px 26px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
  },
  vesselsHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  vesselsTitle: {
    margin: 0,
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  vesselCountBadge: {
    background: "#eff6ff",
    color: "#0284c7",
    padding: "4px 10px",
    borderRadius: 12,
    fontSize: "0.75rem",
    fontWeight: 700,
  },
  vesselsList: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  vesselItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    borderRadius: 10,
    padding: "14px 18px",
    flexWrap: "wrap",
    gap: 12,
  },
  vesselInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  vesselName: {
    fontWeight: 700,
    fontSize: "0.95rem",
    color: "#0f172a",
  },
  vesselMeta: {
    fontSize: "0.8rem",
    color: "#64748b",
  },
  trackBoatBtn: {
    padding: "8px 14px",
    background: "#0f766e",
    color: "#ffffff",
    borderRadius: 6,
    fontSize: "0.8rem",
    fontWeight: 600,
    textDecoration: "none",
  },
  settingsCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: "22px 26px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
  },
  settingsTitle: {
    margin: "0 0 16px 0",
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#0f172a",
  },
  settingsGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 14,
  },
  settingItem: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #f1f5f9",
    paddingBottom: 12,
    flexWrap: "wrap",
    gap: 10,
  },
  settingName: {
    fontSize: "0.88rem",
    color: "#0f172a",
  },
  settingDesc: {
    margin: "2px 0 0 0",
    fontSize: "0.78rem",
    color: "#64748b",
  },
  enabledBadge: {
    background: "#dcfce7",
    color: "#15803d",
    padding: "4px 10px",
    borderRadius: 12,
    fontSize: "0.72rem",
    fontWeight: 700,
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
    background: "#0f766e",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "0.9rem",
    textDecoration: "none",
    boxShadow: "0 4px 12px rgba(15, 118, 110, 0.2)",
  },
  logoutActionBtn: {
    padding: "12px 20px",
    borderRadius: 8,
    background: "transparent",
    color: "#64748b",
    border: "1px solid #cbd5e1",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
  },
};