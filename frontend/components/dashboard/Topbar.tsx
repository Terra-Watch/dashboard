"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchGateways } from "../../lib/api";

type TopbarProps = {
  sidebarOpen: boolean;
  onMenuClick: () => void;
};

export function Topbar({ sidebarOpen, onMenuClick }: TopbarProps) {
  const [gatewayStatus, setGatewayStatus] = useState<"ONLINE" | "OFFLINE" | "UNKNOWN">("UNKNOWN");
  const [lastSync, setLastSync] = useState<string>("Unavailable");

  useEffect(() => {
    let mounted = true;

    async function checkStatus() {
      const gateways = await fetchGateways();
      if (!mounted) return;
      const gateway = gateways[0];
      if (gateway) {
        setGatewayStatus(gateway.status);
        const latestTime = new Date(gateway.lastSeen);
        const diffSeconds = Math.floor((Date.now() - latestTime.getTime()) / 1000);
        if (diffSeconds < 5) {
          setLastSync("Just now");
        } else if (diffSeconds < 60) {
          setLastSync(`${diffSeconds}s ago`);
        } else {
          setLastSync(`${Math.floor(diffSeconds / 60)}m ago`);
        }
      } else {
        setGatewayStatus("UNKNOWN");
        setLastSync("Unavailable");
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 3000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="topbar">
      <button
        className={`menu-button${sidebarOpen ? " menu-button-open" : ""}`}
        type="button"
        aria-label={sidebarOpen ? "Close navigation" : "Open navigation"}
        aria-expanded={sidebarOpen}
        onClick={onMenuClick}
      >
        <span aria-hidden="true" className="menu-line" />
        <span aria-hidden="true" className="menu-line" />
        <span aria-hidden="true" className="menu-line" />
      </button>

      <div className="topbar-page">Overview</div>

      <div className="topbar-meta" aria-label="Connection status" style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
        <div className="topbar-status" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "50%",
              backgroundColor: gatewayStatus === "ONLINE" ? "#16a34a" : "#94a3b8",
              boxShadow: gatewayStatus === "ONLINE" ? "0 0 10px #22c55e" : "none",
              display: "inline-block",
            }}
            aria-hidden="true"
          />
          <span className="topbar-meta-label" style={{ fontWeight: 600, color: "#475569" }}>Gateway</span>
          <span
            className="topbar-meta-value"
            style={{
              color: gatewayStatus === "ONLINE" ? "#15803d" : "#64748b",
              fontWeight: 700,
              background: gatewayStatus === "ONLINE" ? "#dcfce7" : "#f1f5f9",
              padding: "3px 10px",
              borderRadius: "20px",
              border: gatewayStatus === "ONLINE" ? "1px solid #86efac" : "1px solid #cbd5e1",
              fontSize: "0.8rem",
              letterSpacing: "0.02em",
            }}
          >
            {gatewayStatus === "UNKNOWN" ? "Unavailable" : gatewayStatus}
          </span>
        </div>
        <div className="topbar-sync" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="topbar-meta-label" style={{ color: "#64748b" }}>Last sync</span>
          <span className="topbar-meta-value" style={{ fontWeight: 600, color: "#0f172a" }}>{lastSync}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "12px", borderLeft: "1px solid #cbd5e1", paddingLeft: "16px" }}>
          <a
            href="https://github.com/RESQ-LoRa"
            target="_blank"
            rel="noreferrer"
            className="docs-header-btn-github"
            style={{ padding: "5px 10px", fontSize: "0.75rem", border: "1px solid #cbd5e1", color: "#475569" }}
            title="View Source on GitHub"
          >
            <svg viewBox="0 0 24 24" fill="currentColor" width="13" height="13" style={{ marginRight: "4px", verticalAlign: "middle" }}>
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
            </svg>
            <span>GitHub</span>
          </a>
          <Link
            href="/docs"
            className="docs-header-btn-dashboard"
            style={{ padding: "5px 10px", fontSize: "0.75rem", background: "var(--color-navy)", color: "#fff" }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ marginRight: "4px", verticalAlign: "middle" }}>
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            <span>Docs</span>
          </Link>
          <Link
            href="/profile"
            className="docs-header-btn-dashboard"
            style={{ padding: "5px 10px", fontSize: "0.75rem", background: "#0284c7", color: "#fff", textDecoration: "none", borderRadius: "6px", display: "inline-flex", alignItems: "center" }}
            title="View User Profile"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="13" height="13" style={{ marginRight: "4px", verticalAlign: "middle" }}>
              <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Profile</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
