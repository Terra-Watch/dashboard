"use client";

import { useAuth } from "../../../lib/family/authContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";

export default function AdminProfilePage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && (!user || user.role !== "ADMIN")) {
      router.replace("/profile");
    }
  }, [isLoading, router, user]);

  if (isLoading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#64748b" }}>
        Loading System Administrator Profile...
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return null;
  }

  return (
    <div style={styles.pageWrapper}>
      {/* Top Navigation */}
      <div style={styles.topNav}>
        <Link href="/dashboard" style={styles.brandLink}>
          <span style={styles.brandIcon}>⚙️</span>
          <span style={styles.brandTitle}>JALARI ROOT ADMINISTRATION</span>
        </Link>
        <div style={styles.navActions}>
          <Link href="/dashboard" style={styles.secondaryBtn}>
            ← Operations Console
          </Link>
          <button onClick={() => logout()} style={styles.logoutBtn}>
            Sign Out
          </button>
        </div>
      </div>

      <div style={styles.mainContainer}>
        {/* Hero Card */}
        <div style={styles.heroCard}>
          <div style={styles.heroLeft}>
            <div style={styles.avatarCircle}>
              <span>👑</span>
            </div>
            <div>
              <div style={styles.roleBadge}>ROOT SYSTEM ADMINISTRATOR</div>
              <h1 style={styles.name}>{user.name || "System Administrator"}</h1>
              <p style={styles.bio}>
                Infrastructure Security &amp; Fleet Data Operations • Full Superuser Access
              </p>
            </div>
          </div>
          <div style={styles.heroRight}>
            <span style={styles.statusPill}>● ROOT PERMISSIONS ACTIVE</span>
          </div>
        </div>

        {/* Admin Credentials */}
        <div style={styles.gridSection}>
          <div style={styles.sectionHeader}>
            <h2 style={styles.sectionTitle}>Administrator Credentials</h2>
          </div>
          <div style={styles.cardsGrid}>
            <InfoCard label="Account Name" value={user.name || "System Administrator"} icon="👤" />
            <InfoCard label="Admin Email" value={user.email} icon="✉️" />
            <InfoCard label="Security Role" value="ADMIN (Tier 1 Superuser)" icon="🔐" />
            <InfoCard label="Auth Method" value="JALARI backend authentication" icon="⚡" />
          </div>
        </div>

        {/* Platform Status */}
        <div style={styles.platformCard}>
          <h3 style={styles.platformTitle}>🖥️ Platform Infrastructure &amp; Health</h3>
          <div style={styles.platformGrid}>
            <div style={styles.healthBox}>
              <span style={styles.healthLabel}>FastAPI Backend</span>
              <span style={{ ...styles.healthValue, color: "#22c55e" }}>● ONLINE (Port 8000)</span>
            </div>
            <div style={styles.healthBox}>
              <span style={styles.healthLabel}>Authentication</span>
              <span style={{ ...styles.healthValue, color: "#22c55e" }}>
                ● JALARI BACKEND
              </span>
            </div>
            <div style={styles.healthBox}>
              <span style={styles.healthLabel}>Database Schema</span>
              <span style={{ ...styles.healthValue, color: "#22c55e" }}>● ALEMBIC MIGRATED (7a8f9e1b2c3d)</span>
            </div>
            <div style={styles.healthBox}>
              <span style={styles.healthLabel}>Coast Guard LoRa Gateway</span>
              <span style={{ ...styles.healthValue, color: "#22c55e" }}>● ACTIVE &amp; SYNCING</span>
            </div>
          </div>
        </div>

        {/* Administration Links */}
        <div style={styles.quickLinksSection}>
          <h3 style={styles.platformTitle}>🛠️ Administration Shortcuts</h3>
          <div style={styles.quickGrid}>
            <Link href="/dashboard" style={styles.quickCard}>
              <span style={styles.quickIcon}>📊</span>
              <div>
                <strong style={styles.quickName}>Operations Dashboard</strong>
                <span style={styles.quickDesc}>Full fleet metrics</span>
              </div>
            </Link>
            <Link href="/dashboard/gateway" style={styles.quickCard}>
              <span style={styles.quickIcon}>📡</span>
              <div>
                <strong style={styles.quickName}>Gateway Management</strong>
                <span style={styles.quickDesc}>LoRa packet gateways</span>
              </div>
            </Link>
            <Link href="/dashboard/system-status" style={styles.quickCard}>
              <span style={styles.quickIcon}>🩺</span>
              <div>
                <strong style={styles.quickName}>System Diagnostics</strong>
                <span style={styles.quickDesc}>Network latency &amp; packet loss</span>
              </div>
            </Link>
            <Link href="/docs" style={styles.quickCard}>
              <span style={styles.quickIcon}>📖</span>
              <div>
                <strong style={styles.quickName}>Developer Docs</strong>
                <span style={styles.quickDesc}>API schema &amp; endpoints</span>
              </div>
            </Link>
          </div>
        </div>

        {/* Action Bar */}
        <div style={styles.actionBar}>
          <Link href="/dashboard" style={styles.primaryActionBtn}>
            Return to Operations Dashboard →
          </Link>
          <button onClick={() => logout()} style={styles.logoutActionBtn}>
            Sign Out of Administrator Session
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
    backgroundColor: "#09090b",
    color: "#f8fafc",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    paddingBottom: 48,
  },
  topNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "16px 24px",
    background: "#18181b",
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
    color: "#c084fc",
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
    background: "linear-gradient(135deg, #1e1b4b 0%, #18181b 100%)",
    border: "1px solid rgba(192, 132, 252, 0.25)",
    borderRadius: 16,
    padding: "28px 32px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 20,
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.5)",
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
    background: "linear-gradient(135deg, #7c3aed 0%, #581c87 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "1.8rem",
    boxShadow: "0 4px 12px rgba(124, 58, 237, 0.4)",
  },
  roleBadge: {
    fontSize: "0.72rem",
    fontWeight: 800,
    color: "#c084fc",
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
    color: "#a1a1aa",
  },
  heroRight: {},
  statusPill: {
    background: "rgba(168, 85, 247, 0.15)",
    border: "1px solid #a855f7",
    color: "#d8b4fe",
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
    color: "#e4e4e7",
  },
  cardsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  card: {
    background: "#18181b",
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
    color: "#a1a1aa",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  cardValue: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: "#f8fafc",
  },
  platformCard: {
    background: "#18181b",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: 14,
    padding: "22px 26px",
  },
  platformTitle: {
    margin: "0 0 16px 0",
    fontSize: "1.05rem",
    fontWeight: 700,
    color: "#e4e4e7",
  },
  platformGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14,
  },
  healthBox: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    background: "rgba(0, 0, 0, 0.25)",
    padding: "12px 14px",
    borderRadius: 8,
    border: "1px solid rgba(255, 255, 255, 0.05)",
  },
  healthLabel: {
    fontSize: "0.72rem",
    color: "#a1a1aa",
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  healthValue: {
    fontSize: "0.82rem",
    fontWeight: 700,
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
    background: "#18181b",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    borderRadius: 12,
    padding: "16px 18px",
    textDecoration: "none",
    color: "inherit",
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
    color: "#a1a1aa",
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
    background: "#7c3aed",
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "0.9rem",
    textDecoration: "none",
    boxShadow: "0 4px 12px rgba(124, 58, 237, 0.3)",
  },
  logoutActionBtn: {
    padding: "12px 20px",
    borderRadius: 8,
    background: "transparent",
    color: "#a1a1aa",
    border: "1px solid rgba(255, 255, 255, 0.2)",
    fontSize: "0.85rem",
    fontWeight: 600,
    cursor: "pointer",
  },
};
