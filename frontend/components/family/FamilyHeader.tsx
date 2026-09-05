"use client";

import React from "react";
import Link from "next/link";
import { useAuth } from "../../lib/family/authContext";

interface FamilyHeaderProps {
  currentBoatId?: string;
  boatName?: string;
}

export function FamilyHeader({ currentBoatId, boatName }: FamilyHeaderProps) {
  const { user, logout } = useAuth();

  return (
    <header style={styles.header}>
      <div style={styles.content}>
        {/* Left: Brand / Home Link */}
        <Link href="/family" style={styles.brandLink}>
          <div style={styles.iconCircle}>
            <svg
              style={styles.logoSvg}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M2 17a5 5 0 0 0 10 0 5 5 0 0 0 10 0" />
              <path d="M12 2v10" />
              <path d="m4.93 10.93 4.24-4.24" />
              <path d="m14.83 6.69 4.24 4.24" />
            </svg>
          </div>
          <div>
            <div style={styles.brandName}>JALARI</div>
            <div style={styles.brandSubtitle}>FAMILY SAFETY VIEW</div>
          </div>
        </Link>

        {/* Right: User Profile & Logout */}
        <div style={styles.rightCluster}>
          <Link href="/profile" style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }} title="View Profile">
            <div style={styles.userInfo}>
              <span style={styles.userName}>{user?.name || "Family Member"}</span>
              <span style={styles.userRole}>
                {user?.phone ? `${user.phone}` : "Family Account"} • <span style={{ textDecoration: "underline" }}>Profile</span>
              </span>
            </div>
          </Link>

          <button
            onClick={() => logout()}
            style={styles.logoutButton}
            title="Sign out of family portal"
            aria-label="Logout"
          >
            <svg
              style={styles.logoutIcon}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span style={styles.logoutText}>Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
}

const styles: Record<string, React.CSSProperties> = {
  header: {
    backgroundColor: "#29434d",
    color: "#f4f5f2",
    borderBottom: "1px solid rgba(255, 255, 255, 0.12)",
    position: "sticky",
    top: 0,
    zIndex: 40,
    boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
  },
  content: {
    maxWidth: "1080px",
    margin: "0 auto",
    padding: "10px 16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brandLink: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    textDecoration: "none",
    color: "inherit",
  },
  iconCircle: {
    width: "34px",
    height: "34px",
    borderRadius: "8px",
    background: "rgba(255, 255, 255, 0.15)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#ffffff",
  },
  logoSvg: {
    width: "18px",
    height: "18px",
  },
  brandName: {
    fontSize: "1.05rem",
    fontWeight: "800",
    letterSpacing: "0.12em",
    lineHeight: "1.1",
  },
  brandSubtitle: {
    fontSize: "0.62rem",
    color: "rgba(244, 245, 242, 0.72)",
    letterSpacing: "0.08em",
    fontWeight: "600",
  },
  rightCluster: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
  },
  userInfo: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
  },
  userName: {
    fontSize: "0.82rem",
    fontWeight: "600",
    color: "#ffffff",
    lineHeight: "1.2",
  },
  userRole: {
    fontSize: "0.68rem",
    color: "rgba(244, 245, 242, 0.65)",
  },
  logoutButton: {
    display: "flex",
    alignItems: "center",
    gap: "5px",
    background: "rgba(255, 255, 255, 0.1)",
    border: "1px solid rgba(255, 255, 255, 0.18)",
    borderRadius: "6px",
    color: "#ffffff",
    padding: "6px 10px",
    fontSize: "0.75rem",
    fontWeight: "600",
    cursor: "pointer",
    transition: "background 0.15s ease",
  },
  logoutIcon: {
    width: "14px",
    height: "14px",
  },
  logoutText: {
    display: "inline",
  },
};
