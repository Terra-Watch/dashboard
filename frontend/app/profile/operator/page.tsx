"use client";

import { useAuth } from "../../../lib/family/authContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function OperatorProfilePage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || (user.role !== "OPERATOR" && user.role !== "ADMIN"))) {
      router.replace("/profile");
    }
  }, [isLoading, router, user]);

  if (isLoading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
        Loading Command Operations Profile...
      </div>
    );
  }

  if (!user || (user.role !== "OPERATOR" && user.role !== "ADMIN")) {
    return null;
  }

  return (
    <div style={styles.pageWrapper}>
      {/* Top Navigation Bar */}
      <div style={styles.topNav}>
        <Link href="/dashboard" style={styles.brandLink}>
          <span style={styles.brandIcon}>🛡️</span>
          <span style={styles.brandTitle}>JALARI COMMAND OPERATIONS</span>
        </Link>
        <div style={styles.navActions}>
          <Link href="/dashboard" style={styles.secondaryBtn}>
            ← Back to Operations Console
          </Link>
          <button onClick={() => logout()} style={styles.logoutBtn}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={styles.mainContainer}>
        {/* Officer Hero Card */}
        <div style={styles.heroCard}>
          <div style={styles.heroLeft}>
            <div style={styles.avatarCircle}>
              <span>🛡️</span>
            </div>
            <div>
              <div style={styles.roleBadge}>COAST GUARD / OPERATIONS OFFICER</div>
              <h1 style={styles.name}>{user.name || "Officer K. Sharma"}</h1>
              <p style={styles.bio}>
                Maritime Command Center • Duty Post: Bay of Bengal Coastal Sector
              </p>
            </div>
          </div>
          <div style={styles.heroRight}>
            <span style={styles.statusPill}>● ON-DUTY WATCHSTANDER</span>
          </div>
        </div>

        {/* Officer Details Grid */}
        <div style={styles.gridSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Duty Credentials &amp; Station</h2>
          </div>
          <div style={styles.cardsGrid}>
            <InfoCard label="Officer Name" value={user.name || "Officer K. Sharma"} icon="👮" />
            <InfoCard label="Department Email" value={user.email} icon="✉️" />
            <InfoCard label="Duty Comm Line" value={user.phone || "+91 94400 11223"} icon="📞" />
            <InfoCard label="Operator Badge ID" value="JALARI-OP-774" icon="🏷️" />
          </div>
        </div>

        {/* Command Scope & Permissions */}
        <div style={styles.scopeCard}>
          <h3 style={styles.scopeTitle}>⚡ Operational Authority &amp; Access Controls</h3>
          <div style={styles.scopeGrid}>
            <div style={styles.scopeItem}>
              <span style={styles.checkIcon}>✓</span>
              <div>
                <strong>Maritime Distress Dispatch</strong>
                <p style={styles.scopeDesc}>Authorized to acknowledge, escalate, and dispatch Coast Guard search &amp; rescue units.</p>
              </div>
            </div>
            <div style={styles.scopeItem}>
              <span style={styles.checkIcon}>✓</span>
              <div>
                <strong>Harbour LoRa Gateway Supervision</strong>
                <p style={styles.scopeDesc}>Full telemetry inspection and health monitoring across coastal receiver nodes.</p>
              </div>
            </div>
            <div style={styles.scopeItem}>
              <span style={styles.checkIcon}>✓</span>
              <div>
                <strong>Incident Resolution Sign-Off</strong>
                <p style={styles.scopeDesc}>Permitted to formally resolve SOS emergencies and log rescue outcome reports.</p>
              </div>
            </div>
            <div style={styles.scopeItem}>
              <span style={styles.checkIcon}>✓</span>
              <div>
                <strong>Fleet Geofence Override</strong>
                <p style={styles.scopeDesc}>Authority to update international maritime boundary line (IMBL) warning buffers.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Operations Links */}
        <div style={styles.quickLinksSection}>
          <h3 style={styles.scopeTitle}>🚀 Quick Console Navigation</h3>
          <div style={styles.quickGrid}>
            <Link href="/dashboard" style={styles.quickCard}>
              <span style={styles.quickIcon}>📊</span>
              <div>
                <strong style={styles.quickName}>Operations Overview</strong>
                <span style={styles.quickDesc}>Fleet metrics &amp; active watch</span>
              </div>
            </Link>
            <Link href="/dashboard/alerts" style={styles.quickCard}>
              <span style={styles.quickIcon}>🚨</span>
              <div>
                <strong style={styles.quickName}>Alerts &amp; SOS Queue</strong>
                <span style={styles.quickDesc}>Real-time emergency events</span>
              </div>
            </Link>
            <Link href="/dashboard/map" style={styles.quickCard}>
              <span style={styles.quickIcon}>🗺️</span>
              <div>
                <strong style={styles.quickName}>Live Fleet Radar Map</strong>
                <span style={styles.quickDesc}>GPS tracking &amp; boundary checks</span>
              </div>
            </Link>
            <Link href="/dashboard/gateway" style={styles.quickCard}>
              <span style={styles.quickIcon}>📡</span>
              <div>
                <strong style={styles.quickName}>LoRa Gateways</strong>
                <span style={styles.quickDesc}>Receiver nodes &amp; signal sync</span>
              </div>
            </Link>
          </div>
        </div>

        {/* Action Bar */}
        <div style={styles.actionBar}>
          <Link href="/dashboard" style={styles.primaryActionBtn}>
            Launch Operations Console →
          </Link>
          <button onClick={() => logout()} style={styles.logoutActionBtn}>
            Sign Out of Command Session
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
    backgroundColor: "#0b1320",
    color: "#f8fafc",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    paddingBottom: 48,
  },
  topNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    background: "#131f33",
    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
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
    color: "#60a5fa",
  },
  navActions: {
    display: "flex",
    gap: 12,
  },
  secondaryBtn: {
    padding: "8px 14px",
    borderRadius: 8,
    background: "rgba(255, 255, 255, 0.08)",
    color: "#ffffff",
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
    border: "1px solid rgba(96, 165, 250, 0.25)",
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
    background: "linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.8rem",
    boxShadow: "0 4px 12px rgba(29, 78, 216, 0.4)",
  },
  roleBadge: {
    fontSize: "0.72rem",
    fontWeight: 800,
    color: "#60a5fa",
    letterSpacing: "0.1em",
    marginBottom: 4,
  },
  name: {
    margin: "0 0 6px 0",
    fontSize: "1.8rem",
    fontWeight: 800,
    color: "#f8fafc",
  },
  bio: {
    margin: 0,
    fontSize: "0.86rem",
    color: "#94a3b8",
  },
  heroRight: {},
  statusPill: {
    background: "rgba(59, 130, 246, 0.15)",
    border: "1px solid #3b82f6",
    color: "#93c5fd",
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
    background: "#131f33",
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
  scopeCard: {
    background: "#131f33",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    padding: "22px 26px",
  },
  scopeTitle: {
    margin: "0 0 16px 0",
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#cbd5e1",
  },
  scopeGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
    gap: 16,
  },
  scopeItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
  },
  checkIcon: {
    color: "#3b82f6",
    fontWeight: 800,
    fontSize: "1rem",
  },
  scopeDesc: {
    margin: "3px 0 0 0",
    fontSize: "0.78rem",
    color: "#94a3b8",
    lineHeight: "1.35",
  },
  quickLinksSection: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: 14,
  },
  quickCard: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    background: "#131f33",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: "16px 18px",
    textDecoration: "none",
    color: "inherit",
    transition: "transform 0.15s ease, border-color 0.15s ease",
  },
  quickIcon: {
    fontSize: "1.5rem",
  },
  quickName: {
    display: "block",
    fontSize: "0.88rem",
    fontWeight: 700,
    color: "#f8fafc",
  },
  quickDesc: {
    display: "block",
    fontSize: "0.74rem",
    color: "#94a3b8",
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
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "0.9rem",
    textDecoration: "none",
    boxShadow: "0 4px 12px rgba(37, 99, 235, 0.3)",
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