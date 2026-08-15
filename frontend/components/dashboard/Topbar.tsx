"use client";

import { useEffect, useState } from "react";
import { fetchBoats, fetchHistory } from "../../lib/api";

type TopbarProps = {
  sidebarOpen: boolean;
  onMenuClick: () => void;
};

export function Topbar({ sidebarOpen, onMenuClick }: TopbarProps) {
  const [gatewayOnline, setGatewayOnline] = useState(true);
  const [lastSync, setLastSync] = useState<string>("Just now");

  useEffect(() => {
    let mounted = true;

    async function checkStatus() {
      const history = await fetchHistory();
      if (!mounted) return;
      if (history && history.length > 0) {
        setGatewayOnline(true);
        const latestTime = new Date(history[0].timestamp);
        const diffSeconds = Math.floor((Date.now() - latestTime.getTime()) / 1000);
        if (diffSeconds < 5) {
          setLastSync("Just now");
        } else if (diffSeconds < 60) {
          setLastSync(`${diffSeconds}s ago`);
        } else {
          setLastSync(`${Math.floor(diffSeconds / 60)}m ago`);
        }
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
              backgroundColor: gatewayOnline ? "#16a34a" : "#94a3b8",
              boxShadow: gatewayOnline ? "0 0 10px #22c55e" : "none",
              display: "inline-block",
            }}
            aria-hidden="true"
          />
          <span className="topbar-meta-label" style={{ fontWeight: 600, color: "#475569" }}>Gateway</span>
          <span
            className="topbar-meta-value"
            style={{
              color: gatewayOnline ? "#15803d" : "#64748b",
              fontWeight: 700,
              background: gatewayOnline ? "#dcfce7" : "#f1f5f9",
              padding: "3px 10px",
              borderRadius: "20px",
              border: gatewayOnline ? "1px solid #86efac" : "1px solid #cbd5e1",
              fontSize: "0.8rem",
              letterSpacing: "0.02em",
            }}
          >
            {gatewayOnline ? "Connected (ONLINE)" : "Not connected"}
          </span>
        </div>
        <div className="topbar-sync" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <span className="topbar-meta-label" style={{ color: "#64748b" }}>Last sync</span>
          <span className="topbar-meta-value" style={{ fontWeight: 600, color: "#0f172a" }}>{lastSync}</span>
        </div>
      </div>
    </header>
  );
}
